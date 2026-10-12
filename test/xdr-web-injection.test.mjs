import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide } from '../xdr/web-injection/decide.mjs';
import { readAlerts, projectAlerts } from '../xdr/web-injection/read-alerts.mjs';
import {
  planResponses, processXdrResponses, createZtnaDenyGate,
} from '../xdr/web-injection/respond.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/web-injection.json', import.meta.url),'utf8'));
const patternDoc = JSON.parse(await readFile(new URL('../xdr/web-injection/patterns.json', import.meta.url),'utf8'));

test('read all 26 Wazuh web alerts into five safe fields without credential leakage', async () => {
  const {inputCount, lines} = await readAlerts();
  assert.equal(inputCount,26);
  assert.equal(lines.length,fixture.alerts.length);
  assert.deepEqual(Object.keys(lines[0]).sort(),
    ['timestamp','sourceAddress','account','ruleLevel','description'].sort());
  assert.equal(lines[0].account,'[미기록]');
  assert.equal(lines[17].account,'user01');
  assert.equal(lines[0].sourceAddress,'203.0.113.10');
  const injection = structuredClone(fixture.alerts[0]);
  injection.rule.description = 'Authorization: Bearer topsecret';
  injection.data.srcuser = 'someone@example.invalid';
  const [safe] = projectAlerts({...fixture,alerts:[injection]});
  assert.equal(safe.description,'[비밀값 제외]');
  assert.equal(safe.account,'[미기록]');
  assert.doesNotMatch(JSON.stringify(safe),/topsecret|someone@example/u);
});

test('MITRE T1190 patterns have exactly one line of evidence each',()=>{
  assert.equal(patternDoc.schema,'byteback.xdr.web-injection.patterns.v1');
  assert.equal(patternDoc.mitre,'T1190');
  assert.equal(patternDoc.patterns.length,4);
  for (const entry of patternDoc.patterns) {
    assert.ok(entry.name.length>2);
    assert.ok(entry.condition.length>20);
    assert.match(entry.evidence,/MITRE ATT&CK T1190/u);
    assert.doesNotMatch(entry.evidence,/\r|\n/u);
  }
});

test('standalone judge module partitions 8 attacks, 9 uncertain, 9 normal',()=>{
  const decisions=fixture.alerts.map(item=>decide(item));
  assert.equal(decisions.length,26);
  assert.deepEqual(decisions.reduce((sum,d)=>{sum[d.action]++;return sum;},
    {block:0,alert:0,record:0}),{block:8,alert:9,record:9});
  for(let i=0;i<decisions.length;i++){
    const d=decisions[i],id=fixture.alerts[i].id;
    assert.deepEqual(Object.keys(d).sort(),['action','confidence','reason'].sort());
    assert.ok(Number.isFinite(d.confidence)&&d.confidence>=0&&d.confidence<=1);
    assert.ok(typeof d.reason==='string'&&d.reason.length>0);
    assert.equal(d.action,d.confidence>=0.85?'block':d.confidence>=0.5?'alert':'record',id);
    if(i<8)assert.equal(d.action,'block',id);
    else if(i<17)assert.equal(d.action,'alert',id);
    else assert.equal(d.action,'record',id);
  }
  assert.equal(decide(null).action,'record');
  assert.equal(decide({}).action,'record');
  assert.equal(decide({rule:{level:12,mitre:[]},data:{srcip:'203.0.113.99',count:'90'}}).action,'record');
});

test('single-file decide has no imports, disk I/O or network and embeds pattern names',async()=>{
  const code=await readFile(new URL('../xdr/web-injection/decide.mjs',import.meta.url),'utf8');
  for (const unsafe of [/\bimport\b/u,/\brequire\s*\(/u,/\bfetch\s*\(/u,
    /\breadFile\b/u,/\bwriteFile\b/u,/\bprocess\./u]) {
    assert.doesNotMatch(code,unsafe);
  }
  for(const p of patternDoc.patterns)assert.ok(code.includes(JSON.stringify(p.name)));
});

test('isolated unusual input does not trigger IP denial',()=>{
  const attack=structuredClone(fixture.alerts[0]);
  attack.rule.level=12;
  attack.data.count='1';
  assert.notEqual(decide(attack).action,'block');
  attack.data.count='12';
  attack.rule.description='SQL 이라는 수업 공지가 12번 조회됐습니다.';
  assert.notEqual(decide(attack).action,'block');
  attack.rule.description='SQL 구문을 반복 전송했습니다.';
  attack.rule.mitre=[];
  assert.equal(decide(attack).action,'record');
  attack.rule.mitre=['T1190'];
  attack.data.srcip='not-an-ip';
  assert.notEqual(decide(attack).action,'block');
});

test('respond plans 7 unique short-lived IP deny rules from 8 block candidates',()=>{
  const time=new Date('2026-09-27T16:30:00Z');
  const plan=planResponses(fixture.alerts,{now:time});
  assert.equal(plan.reviewed,26);
  assert.deepEqual(plan.counts,{block:8,alert:9,record:9});
  assert.equal(plan.denyRules.length,7);
  assert.equal(plan.suppressedNormalSourceBlocks,0);
  assert.equal(plan.alertLogLines.length,17);
  const danger=new Set(fixture.alerts.slice(0,8).map(x=>x.data.srcip));
  const normalIps=new Set(fixture.alerts.slice(17).map(x=>x.data.srcip));
  for(const rule of plan.denyRules){
    assert.ok(danger.has(rule.sourceIp));
    assert.equal(normalIps.has(rule.sourceIp),false);
    assert.equal(rule.effect,'deny');
    assert.equal(rule.createdAt,time.toISOString());
    assert.equal(rule.expiresAt,new Date(time.valueOf()+900000).toISOString());
    assert.ok(rule.evidenceAlertIds.every(x=>/^wi-\d\d$/u.test(x)));
  }
  assert.deepEqual(plan.denyRules.find(x=>x.sourceIp==='203.0.113.10')?.evidenceAlertIds,
    ['wi-01','wi-02']);
  for(const line of plan.alertLogLines){
    assert.ok(['block','alert'].includes(JSON.parse(line).action));
    assert.doesNotMatch(line,/doc-sql-chain|doc-script-marker|password=|token=|srcip|srcuser|203\.0\.113/u);
  }
});

test('shared normal-IP browsing suppresses suspicious IP denial',()=>{
  const normal=structuredClone(fixture.alerts[17]);
  normal.data.srcip=fixture.alerts[0].data.srcip;
  const plan=planResponses([fixture.alerts[0],normal]);
  assert.equal(plan.denyRules.length,0);
  assert.equal(plan.suppressedNormalSourceBlocks,1);
  assert.match(plan.alertLogLines[0],/차단 보류/u);
});

test('ZTNA pre-gate uses verified source and delegates normal/expired requests',async()=>{
  const now=new Date('2026-09-27T16:30:00Z');
  const rules=planResponses(fixture.alerts,{now}).denyRules;
  let baseCalls=0;
  const original=async request=>{baseCalls++;return {
    schema:'aleph.decision.v1',requestId:request.requestId,
    decision:'deny',reasonCode:'starter_not_ready',ruleIds:['starter.deny'],
  };};
  const gate=createZtnaDenyGate({baseDecide:original,denyRules:rules,
    trustedSourceIp:ctx=>ctx?.verifiedSourceIp,now:()=>now.valueOf()+1000});
  const suspicious=await gate({requestId:'1'}, {verifiedSourceIp:fixture.alerts[0].data.srcip});
  assert.equal(suspicious.blocked,true);
  assert.equal(suspicious.stage,'xdr-pre-gate');
  assert.ok(suspicious.evidenceAlertIds.includes('wi-01'));
  assert.equal(baseCalls,0);
  const normal=await gate({requestId:'2',sourceIp:fixture.alerts[0].data.srcip},
    {verifiedSourceIp:fixture.alerts[17].data.srcip});
  assert.equal(normal.blocked,false);
  assert.equal(normal.decision.decision,'deny');
  assert.equal(baseCalls,1);
  const expired=createZtnaDenyGate({baseDecide:original,denyRules:rules,
    trustedSourceIp:ctx=>ctx?.verifiedSourceIp,
    now:()=>now.valueOf()+16*60000});
  assert.equal((await expired({requestId:'3'},
    {verifiedSourceIp:fixture.alerts[0].data.srcip})).blocked,false);
});

test('respond writes safe append log and separate ignored runtime rules',async()=>{
  const root=await mkdtemp(join(tmpdir(),'byteback-xdr-02-'));
  try{
    const plan=await processXdrResponses({root,alerts:fixture.alerts,
      now:new Date('2026-09-27T16:30:00Z')});
    const log=await readFile(join(root,'xdr','alerts.log'),'utf8');
    const tmp=JSON.parse(await readFile(join(root,'xdr','web-injection','deny-rules.runtime.json'),'utf8'));
    assert.equal(log.trim().split('\n').length,17);
    assert.equal(tmp.rules.length,7);
    assert.equal(plan.denyRules.length,7);
    assert.doesNotMatch(log,/srcip|srcuser|Authorization|Bearer |password=|token=|doc-sql-chain/u);
  }finally{await rm(root,{recursive:true,force:true});}
});
