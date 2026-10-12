// XDR-02 response adapter: local, expiring web-injection deny proposals.
// This never edits src/decider.mjs or sends rules to an actual network device.
// Real deployments must supply a VERIFIED client source IP, not a browser field.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,60}$/u.test(id);
function validIp(ip) {
  return typeof ip === 'string' && ip.split('.').length === 4
    && ip.split('.').every(x => /^(?:0|[1-9][0-9]{0,2})$/u.test(x) && Number(x) <= 255);
}
function clearlyNormal(alert) {
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description : '';
  return Number.isInteger(alert?.rule?.level) && alert.rule.level <= 3
    && /조회|화면|새로고침|로그아웃|정적|검색어/u.test(description);
}

/** Pure rule planner: classify all fixture events before proposing any block. */
export function planResponses(alerts, { now = new Date(), ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!Array.isArray(alerts) || !(now instanceof Date) || !Number.isFinite(now.valueOf())
      || !Number.isInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 3_600_000) {
    throw new TypeError('invalid_response_arguments');
  }
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.valueOf() + ttlMs).toISOString();
  const decided = alerts.map(alert => ({ alert, decision: decide(alert) }));

  // Shared egress IPs may contain legitimate browsing. Prefer review over
  // blanket IP denial if we have clear normal activity at that source.
  const legitimateIps = new Set(decided.filter(({alert,decision}) =>
    decision.action === 'record' && clearlyNormal(alert)
    && validIp(alert?.data?.srcip)).map(({alert}) => alert.data.srcip));

  const byIp = new Map();
  const logLines = [];
  let withheld = 0;
  for (const {alert,decision} of decided) {
    const id = validId(alert?.id) ? alert.id : 'unknown';
    const ip = alert?.data?.srcip;
    const blockedCandidate = decision.action === 'block' && decision.confidence >= 0.85;
    const actionable = blockedCandidate && validId(alert?.id)
      && validIp(ip) && !legitimateIps.has(ip);
    if (blockedCandidate && !actionable) withheld += 1;
    if (actionable) {
      let rule = byIp.get(ip);
      if (!rule) {
        rule = {
          ruleId: 'xdr.web_injection.' + ip.replaceAll('.', '_'),
          effect: 'deny', sourceIp: ip,
          createdAt, expiresAt,
          evidenceAlertIds: [id], pattern: decision.reason,
        };
        byIp.set(ip, rule);
      } else if (!rule.evidenceAlertIds.includes(id)) {
        rule.evidenceAlertIds.push(id);
      }
    }
    if (decision.action !== 'record') {
      // Never log the request URL, body, account, raw Wazuh rule or IP.
      logLines.push(JSON.stringify({
        at: createdAt, alertId: id,
        action: blockedCandidate && !actionable ? 'alert' : decision.action,
        confidence: decision.confidence,
        reason: blockedCandidate && !actionable
          ? '정상 사용자와 같은 출발지 주소로 확인돼 차단 보류'
          : decision.reason,
      }));
    }
  }
  return {
    denyRules: [...byIp.values()],
    alertLogLines: logLines,
    suppressedNormalSourceBlocks: withheld,
    reviewed: decided.length,
    counts: decided.reduce((counts,{decision}) => {
      counts[decision.action] += 1;
      return counts;
    },{block:0,alert:0,record:0}),
  };
}

/**
 * Offline-compatible ZTNA pre-gate.
 * Only trustedContext, validated by the enclosing transport, provides IP.
 * If there is no active deny rule, defer to the existing ZTNA decision.
 */
export function createZtnaDenyGate({ baseDecide, denyRules, trustedSourceIp, now = () => Date.now() }) {
  if (typeof baseDecide !== 'function' || !Array.isArray(denyRules)
      || typeof trustedSourceIp !== 'function' || typeof now !== 'function') {
    throw new TypeError('invalid_ztna_gate');
  }
  return async function evaluate(request, trustedContext) {
    const sourceIp = trustedSourceIp(trustedContext);
    const at = now();
    const matched = validIp(sourceIp) && Number.isFinite(at) ? denyRules.find(rule =>
      rule?.effect === 'deny' && rule.sourceIp === sourceIp
      && validId(rule.evidenceAlertIds?.[0])
      && Number.isFinite(Date.parse(rule.createdAt))
      && Number.isFinite(Date.parse(rule.expiresAt))
      && at >= Date.parse(rule.createdAt)
      && at < Date.parse(rule.expiresAt)) : null;
    if (matched) {
      return { blocked: true, stage: 'xdr-pre-gate',
        ruleId: matched.ruleId, expiresAt: matched.expiresAt,
        evidenceAlertIds: [...matched.evidenceAlertIds] };
    }
    return { blocked: false, stage: 'ztna', decision: await baseDecide(request) };
  };
}

/** Write only local event IDs and temporary rules; both excluded from Git. */
export async function processXdrResponses({ alerts, root = ROOT, now = new Date() }) {
  const plan = planResponses(alerts, { now });
  const dir = join(root,'xdr','web-injection');
  await mkdir(dir, { recursive: true });
  if (plan.alertLogLines.length) {
    await appendFile(join(root,'xdr','alerts.log'), plan.alertLogLines.join('\n')+'\n','utf8');
  }
  await writeFile(join(dir,'deny-rules.runtime.json'),JSON.stringify({
    schema:'byteback.xdr.deny-rules.runtime.v1', rules:plan.denyRules,
  },null,2)+'\n','utf8');
  return plan;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const fixture = JSON.parse(await readFile(join(ROOT,'xdr','fixtures','web-injection.json'),'utf8'));
    const plan = await processXdrResponses({ alerts: fixture.alerts });
    console.log('XDR-02: ' + plan.denyRules.length + ' temporary deny rules; '
      + plan.alertLogLines.length + ' safe alerts; normal-source suppressions '
      + plan.suppressedNormalSourceBlocks);
  } catch {
    console.error('XDR-02 response failure; inspect module and fixture.');
    process.exitCode = 1;
  }
}
