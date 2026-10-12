// XDR-01 response boundary: short-lived local deny rules + safe alert log.
// Keep src/decider.mjs and its registered rule IDs entirely unchanged.
// Only a caller with a trusted/verified source address may activate the gate.
import { appendFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const rootDefault = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_TTL_MS = 15 * 60 * 1000;
function validIp(ip) {
  return typeof ip === 'string' && ip.split('.').length === 4
    && ip.split('.').every(x => /^(?:0|[1-9][0-9]{0,2})$/u.test(x) && Number(x) <= 255);
}
function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9-]{1,60}$/u.test(id);
}
function isNormalSuccess(alert) {
  return /로그인이 성공|로그인 상태|세션 유지|자료실 화면|로그아웃|성공했습니다/u
    .test(String(alert?.rule?.description ?? ''));
}

/** Compute deny proposals. No disk writes and no global engine mutation. */
export function planResponses(alerts, { now = new Date(), ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!Array.isArray(alerts) || !(now instanceof Date) || !Number.isFinite(now.valueOf())
      || !Number.isInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 3_600_000) {
    throw new TypeError('invalid_response_arguments');
  }
  const safeNow = now.toISOString();
  const expiresAt = new Date(now.valueOf() + ttlMs).toISOString();
  const results = alerts.map(a => ({ alert: a, decision: decide(a) }));
  // A verified normal session at the same IP may represent a shared NAT.
  // Prefer human review, never automatically block that source.
  const legitimateIps = new Set(results.filter(x =>
    x.decision.action === 'record' && isNormalSuccess(x.alert)
    && validIp(x.alert?.data?.srcip)).map(x => x.alert.data.srcip));
  const byIp = new Map();
  const alertLogLines = [];
  let suppressed = 0;
  for (const { alert, decision } of results) {
    const id = validId(alert?.id) ? alert.id : 'unknown';
    const ip = alert?.data?.srcip;
    const qualifies = decision.action === 'block' && decision.confidence >= 0.85
      && validIp(ip) && !legitimateIps.has(ip) && validId(alert?.id);
    const isSuppressed = decision.action === 'block' && !qualifies;
    if (isSuppressed) suppressed++;
    if (qualifies) {
      const current = byIp.get(ip);
      if (!current) {
        byIp.set(ip, {
          ruleId: 'xdr.brute_force.' + ip.replaceAll('.', '_'),
          effect: 'deny', sourceIp: ip, createdAt: safeNow, expiresAt,
          evidenceAlertIds: [id], pattern: decision.reason,
        });
      } else if (!current.evidenceAlertIds.includes(id)) current.evidenceAlertIds.push(id);
    }
    if (decision.action !== 'record' || isSuppressed) {
      // Alert logs contain only event ID and fixed classifier labels; no
      // account, IP, password, token, raw rule description or note body.
      alertLogLines.push(JSON.stringify({
        at: safeNow,
        alertId: id,
        action: isSuppressed ? 'alert' : decision.action,
        confidence: decision.confidence,
        reason: isSuppressed ? '정상 사용 이력과 충돌하여 차단 보류' : decision.reason,
      }));
    }
  }
  return { denyRules: [...byIp.values()], alertLogLines,
    suppressedNormalSourceBlocks: suppressed,
    reviewed: alerts.length, recordCount: results.filter(x => x.decision.action === 'record').length };
}

/**
 * XDR pre-gate adapter: the enclosing VERIFIED transport supplies the source.
 * An untrusted browser request field is never a source of truth here.
 * If unmatched, call the original ZTNA decision unchanged.
 * If matched, report an explicit pre-gate deny to the trusted caller,
 * rather than forging an unregistered ZTNA reasonCode.
 */
export function createZtnaDenyGate({ baseDecide, denyRules, trustedSourceIp, now = () => Date.now() }) {
  if (typeof baseDecide !== 'function' || !Array.isArray(denyRules)
      || typeof trustedSourceIp !== 'function' || typeof now !== 'function') {
    throw new TypeError('invalid_ztna_gate');
  }
  return async function evaluate(request, trustedContext) {
    const ip = trustedSourceIp(trustedContext);
    const clock = now();
    const active = validIp(ip) && Number.isFinite(clock)
      ? denyRules.find(rule => rule?.effect === 'deny' && rule.sourceIp === ip
          && validId(rule.evidenceAlertIds?.[0])
          && Number.isFinite(Date.parse(rule.createdAt))
          && Number.isFinite(Date.parse(rule.expiresAt))
          && clock >= Date.parse(rule.createdAt) && clock < Date.parse(rule.expiresAt))
      : null;
    if (active) return {
      blocked: true, stage: 'xdr-pre-gate',
      ruleId: active.ruleId, expiresAt: active.expiresAt,
      evidenceAlertIds: [...active.evidenceAlertIds],
    };
    return { blocked: false, stage: 'ztna', decision: await baseDecide(request) };
  };
}

/** Append safe alerts and write an IGNORED ephemeral rule cache for local demo. */
export async function processXdrResponses({ alerts, root = rootDefault, now = new Date() }) {
  const plan = planResponses(alerts, { now });
  const dir = join(root, 'xdr', 'brute-force');
  await mkdir(dir, { recursive: true });
  if (plan.alertLogLines.length) {
    await appendFile(join(root, 'xdr', 'alerts.log'), plan.alertLogLines.join('\n') + '\n', 'utf8');
  }
  await writeFile(join(dir, 'deny-rules.runtime.json'), JSON.stringify({
    schema: 'byteback.xdr.deny-rules.runtime.v1', rules: plan.denyRules,
  }, null, 2) + '\n', 'utf8');
  return plan;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const fixture = JSON.parse(await readFile(join(rootDefault, 'xdr', 'fixtures', 'brute-force.json'), 'utf8'));
    const plan = await processXdrResponses({ alerts: fixture.alerts });
    console.log('XDR-01: ' + plan.denyRules.length + ' temporary source denies; '
      + plan.alertLogLines.length + ' safe alert lines; '
      + plan.suppressedNormalSourceBlocks + ' potential normal-source blocks suppressed');
  } catch {
    console.error('XDR-01 response failure; inspect fixture and response module.');
    process.exitCode = 1;
  }
}
