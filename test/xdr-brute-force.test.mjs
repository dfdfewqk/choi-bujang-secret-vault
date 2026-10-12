import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide } from '../xdr/brute-force/decide.mjs';
import { readAlerts, projectAlerts } from '../xdr/brute-force/read-alerts.mjs';
import { planResponses, processXdrResponses, createZtnaDenyGate } from '../xdr/brute-force/respond.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url), 'utf8'));
const patterns = JSON.parse(await readFile(new URL('../xdr/brute-force/patterns.json', import.meta.url), 'utf8'));

test('28 original Wazuh alerts become exactly 28 safe five-field projections', async () => {
  const { inputCount, lines } = await readAlerts();
  assert.equal(inputCount, 28);
  assert.equal(lines.length, fixture.alerts.length);
  assert.deepEqual(Object.keys(lines[0]).sort(),
    ['timestamp', 'sourceAddress', 'account', 'ruleLevel', 'description'].sort());
  assert.equal(lines[0].sourceAddress, '203.0.113.10');
  const secretEvent = structuredClone(fixture.alerts[0]);
  secretEvent.data.srcuser = 'someone@example.invalid';
  secretEvent.rule.description = 'password=hunter2 bearer_token=hidden';
  const [redacted] = projectAlerts({ ...fixture, alerts: [secretEvent] });
  assert.equal(redacted.account, '[비공개]');
  assert.equal(redacted.description, '[비밀값 제외]');
  assert.doesNotMatch(JSON.stringify(redacted), /hunter2|someone@example/u);
});

test('patterns are evidence backed T1110 one-line descriptions', () => {
  assert.equal(patterns.mitre, 'T1110');
  assert.equal(patterns.patterns.length, 4);
  for (const p of patterns.patterns) {
    assert.ok(p.name.length > 2 && p.condition.length > 10);
    assert.match(p.evidence, /MITRE ATT&CK T1110/u);
    assert.equal(p.evidence.includes('\n'), false);
  }
});

test('standalone judge classifier partitions clear attacks / ambiguous / normal', () => {
  const out = fixture.alerts.map(alert => decide(alert));
  assert.equal(out.length, 28);
  assert.deepEqual(out.reduce((sum, x) => {
    sum[x.action]++;
    return sum;
  }, { block:0, alert:0, record:0 }), { block:10, alert:9, record:9 });
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    assert.deepEqual(Object.keys(x).sort(), ['action','confidence','reason'].sort());
    assert.ok(typeof x.reason === 'string' && x.reason.length > 0);
    assert.ok(Number.isFinite(x.confidence) && x.confidence >= 0 && x.confidence <= 1);
    assert.equal(x.action, x.confidence >= 0.85 ? 'block'
      : x.confidence >= 0.5 ? 'alert' : 'record');
    if (i < 10) assert.equal(x.action, 'block', fixture.alerts[i].id);
    else if (i < 19) assert.equal(x.action, 'alert', fixture.alerts[i].id);
    else assert.equal(x.action, 'record', fixture.alerts[i].id);
  }
  assert.equal(decide({}).action, 'record');
  assert.equal(decide(null).action, 'record');
  assert.equal(decide({ rule:{level:15,mitre:[]},data:{count:'9999',srcip:'203.0.113.10'} }).action,'record');
});

test('judge file never imports dependencies or performs I/O and embeds the four patterns', async () => {
  const source = await readFile(new URL('../xdr/brute-force/decide.mjs', import.meta.url), 'utf8');
  for (const unsafe of [/\bimport\b/u, /\brequire\s*\(/u, /\bfetch\s*\(/u,
    /\breadFile\b/u, /\bwriteFile\b/u, /\bprocess\./u]) {
    assert.doesNotMatch(source, unsafe);
  }
  for (const p of patterns.patterns) assert.ok(source.includes(JSON.stringify(p.name)));
});

test('response creates only short-lived source deny rules with evidence ids', async () => {
  const now = new Date('2026-09-27T16:30:00Z');
  const plan = planResponses(fixture.alerts, { now });
  assert.equal(plan.reviewed, 28);
  assert.equal(plan.denyRules.length, 10);
  assert.equal(plan.suppressedNormalSourceBlocks, 0);
  assert.equal(plan.alertLogLines.length, 19);
  const suspiciousIps = new Set(fixture.alerts.slice(0,10).map(a=>a.data.srcip));
  const normalIps = new Set(fixture.alerts.slice(19).map(a=>a.data.srcip));
  for (const rule of plan.denyRules) {
    assert.ok(suspiciousIps.has(rule.sourceIp));
    assert.equal(normalIps.has(rule.sourceIp), false);
    assert.equal(rule.effect, 'deny');
    assert.equal(rule.createdAt,now.toISOString());
    assert.equal(rule.expiresAt,new Date(now.valueOf()+900000).toISOString());
    assert.ok(rule.evidenceAlertIds.every(x=>/^bf-\d\d$/u.test(x)));
  }
  for (const line of plan.alertLogLines) {
    assert.ok(!/srcip|srcuser|password|token|user01/u.test(line));
    assert.ok(['block','alert'].includes(JSON.parse(line).action));
  }
});

test('normal success from the same IP suppresses an aggressive temporary block', () => {
  const clone = structuredClone(fixture.alerts[19]);
  clone.data.srcip = fixture.alerts[0].data.srcip;
  const plan = planResponses([...fixture.alerts.slice(0,1),clone]);
  assert.equal(plan.suppressedNormalSourceBlocks,1);
  assert.equal(plan.denyRules.length,0);
  assert.ok(plan.alertLogLines.some(x=>JSON.parse(x).reason.includes('차단 보류')));
});

test('trusted-source ZTNA adapter blocks only active rules and delegates everything else', async () => {
  const now = new Date('2026-09-27T16:30:00Z');
  const plan = planResponses(fixture.alerts,{now});
  let calls=0;
  const baseDecide=async request=>{calls++;return { schema:'aleph.decision.v1',
    requestId:request.requestId,decision:'allow',reasonCode:'approved',ruleIds:['existing']};};
  const gate = createZtnaDenyGate({baseDecide,denyRules:plan.denyRules,
    trustedSourceIp:context=>context?.verifiedSourceIp,
    now:()=>now.getTime()+1});
  const attack=await gate({requestId:'r1'}, {verifiedSourceIp:fixture.alerts[0].data.srcip});
  assert.equal(attack.blocked,true);
  assert.equal(attack.stage,'xdr-pre-gate');
  assert.ok(attack.evidenceAlertIds.includes('bf-01'));
  assert.equal(calls,0);
  const ordinary=await gate({requestId:'r2',sourceIp:fixture.alerts[0].data.srcip},
    {verifiedSourceIp:fixture.alerts[19].data.srcip});
  assert.equal(ordinary.blocked,false);
  assert.equal(ordinary.decision.decision,'allow');
  assert.equal(calls,1);
  const expired=createZtnaDenyGate({baseDecide,denyRules:plan.denyRules,
    trustedSourceIp:x=>x.verifiedSourceIp,
    now:()=>now.valueOf()+16*60000});
  assert.equal((await expired({requestId:'r3'},{verifiedSourceIp:fixture.alerts[0].data.srcip})).blocked,false);
});

test('response writes only ignored safe logs and ephemeral deny-rule cache', async () => {
  const root=await mkdtemp(join(tmpdir(),'byteback-xdr-01-'));
  try {
    const plan=await processXdrResponses({root,alerts:fixture.alerts,
      now:new Date('2026-09-27T16:30:00Z')});
    const alerts=await readFile(join(root,'xdr','alerts.log'),'utf8');
    const rules=JSON.parse(await readFile(join(root,'xdr','brute-force','deny-rules.runtime.json'),'utf8'));
    assert.equal(alerts.trim().split('\n').length,plan.alertLogLines.length);
    assert.equal(rules.rules.length,10);
    assert.doesNotMatch(alerts,/user01|password=|srcip|Bearer /u);
  } finally { await rm(root,{recursive:true,force:true}); }
});
