import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decide} from '../xdr/exfiltration/decide.mjs';
import {readAlerts,projectAlerts} from '../xdr/exfiltration/read-alerts.mjs';
import {planResponses,processXdrResponses,createZtnaDestinationGate} from '../xdr/exfiltration/respond.mjs';
const fixture=JSON.parse(await readFile(new URL('../xdr/fixtures/exfiltration.json',import.meta.url),'utf8'));
const patterns=JSON.parse(await readFile(new URL('../xdr/exfiltration/patterns.json',import.meta.url),'utf8'));
test('30 events project into 30 safe five-field rows',async()=>{
 const {inputCount,lines}=await readAlerts();
 assert.equal(inputCount,30);assert.equal(lines.length,fixture.alerts.length);
 for(const line of lines)assert.deepEqual(Object.keys(line),['timestamp','sourceAddress','account','ruleLevel','description']);
 const tainted=structuredClone(fixture.alerts[0]);
 tainted.rule.description='Authorization: Bearer private-token-value';
 tainted.data.srcuser='private@example.invalid';
 const [safe]=projectAlerts({...fixture,alerts:[tainted]});
 assert.equal(safe.description,'[비밀값 제외]');
 assert.equal(safe.account,'[미기록]');
});
test('patterns are evidenced and mirrored in isolated decide without imports or IO',async()=>{
 assert.deepEqual(patterns.mitre,['T1041','T1048']);
 assert.equal(patterns.patterns.length,4);
 const code=await readFile(new URL('../xdr/exfiltration/decide.mjs',import.meta.url),'utf8');
 for(const entry of patterns.patterns){
  assert.ok(entry.name&&entry.condition&&entry.evidence);
  assert.match(entry.evidence,/MITRE ATT&CK T104[18]/u);
  assert.doesNotMatch(entry.evidence,/[\r\n]/u);
  assert.ok(code.includes(JSON.stringify(entry.name)));
 }
 assert.doesNotMatch(code,/\bimport\b|\brequire\s*\(|\bfetch\s*\(|\breadFile\b|\bwriteFile\b|\bprocess\./u);
});
test('30 cases: 10 clear blocks, 10 alerts, 10 records; normals never blocked',()=>{
 const rows=fixture.alerts.map(decide),counts=rows.reduce((a,x)=>(a[x.action]++,a),{block:0,alert:0,record:0});
 assert.deepEqual(counts,{block:10,alert:10,record:10});
 rows.forEach((r,i)=>{
  assert.deepEqual(Object.keys(r),['action','confidence','reason']);
  assert.equal(r.action,r.confidence>=0.85?'block':r.confidence>=0.5?'alert':'record');
  assert.equal(r.action,i<10?'block':i<20?'alert':'record',fixture.alerts[i].id);
 });
 assert.equal(decide(null).action,'record');
});
test('severity alone, no MITRE and untrusted destination do not trigger block',()=>{
 const a=structuredClone(fixture.alerts[0]);
 a.rule.mitre=[];assert.notEqual(decide(a).action,'block');
 a.rule.mitre=['T1048'];a.rule.level=3;assert.notEqual(decide(a).action,'block');
 a.rule.level=12;a.data.bytes='12';assert.notEqual(decide(a).action,'block');
 a.data.bytes='240000000';delete a.data.dstip;assert.notEqual(decide(a).action,'block');
 a.data.dstip='999.999.999.999';assert.notEqual(decide(a).action,'block');
});
test('8 expiring destination denies and no known normal address blocked',()=>{
 const now=new Date('2026-09-27T08:00:00Z');
 const plan=planResponses(fixture.alerts,{now});
 assert.deepEqual(plan.counts,{block:10,alert:10,record:10});
 assert.equal(plan.denyRules.length,8);
 assert.equal(plan.alertLogLines.length,20);
 const normalIps=new Set(fixture.alerts.slice(20).map(a=>a.data.dstip));
 for(const r of plan.denyRules){
  assert.equal(r.effect,'deny');
  assert.ok(r.evidenceAlertIds.every(id=>/^ex-\d\d$/u.test(id)));
  assert.equal(r.expiresAt,new Date(now.valueOf()+900000).toISOString());
  assert.equal(normalIps.has(r.destinationIp),false);
 }
 assert.deepEqual(plan.denyRules.find(r=>r.destinationIp==='203.0.113.50').evidenceAlertIds,['ex-01','ex-03']);
 for(const line of plan.alertLogLines)
  assert.doesNotMatch(line,/srcip|dstip|srcuser|password|Bearer |203\.0\.113|192\.0\.2|198\.51\.100/u);
 const normal=structuredClone(fixture.alerts[20]);
 normal.data.dstip=fixture.alerts[0].data.dstip;
 const guarded=planResponses([fixture.alerts[0],normal]);
 assert.equal(guarded.denyRules.length,0);
 assert.equal(guarded.suppressedNormalDestinationBlocks,1);
 assert.equal(JSON.parse(guarded.alertLogLines[0]).action,'alert');
});
test('ZTNA pre-gate trusts only verified destination and honors expiry',async()=>{
 const now=new Date('2026-09-27T08:00:00Z'),rules=planResponses(fixture.alerts,{now}).denyRules;
 let delegated=0;
 const baseDecide=async()=>{delegated++;return {decision:'allow'};};
 const gate=createZtnaDestinationGate({baseDecide,denyRules:rules,
  trustedDestinationIp:c=>c?.verifiedDestinationIp,now:()=>now.valueOf()+1000});
 assert.equal((await gate({},{verifiedDestinationIp:'203.0.113.50'})).blocked,true);
 assert.equal(delegated,0);
 const normal=await gate({},{verifiedDestinationIp:'192.0.2.10'});
 assert.equal(normal.blocked,false);assert.equal(normal.decision.decision,'allow');
 assert.equal((await gate({dstip:'203.0.113.50'},{})).blocked,false);
 const expired=createZtnaDestinationGate({baseDecide,denyRules:rules,
  trustedDestinationIp:c=>c?.verifiedDestinationIp,now:()=>now.valueOf()+16*60000});
 assert.equal((await expired({},{verifiedDestinationIp:'203.0.113.50'})).blocked,false);
});
test('runtime logs and deny cache are local and contain no raw Wazuh data',async()=>{
 const root=await mkdtemp(join(tmpdir(),'xdr06-'));
 try{
  const plan=await processXdrResponses({root,alerts:fixture.alerts,now:new Date('2026-09-27T08:00:00Z')});
  assert.equal(plan.denyRules.length,8);
  const log=await readFile(join(root,'xdr','alerts.log'),'utf8');
  const file=JSON.parse(await readFile(join(root,'xdr','exfiltration','deny-rules.runtime.json'),'utf8'));
  assert.equal(log.trim().split('\n').length,20);assert.equal(file.rules.length,8);
  assert.doesNotMatch(log,/srcip|dstip|srcuser|Bearer |203\.0\.113|192\.0\.2|198\.51\.100/u);
 }finally{await rm(root,{recursive:true,force:true});}
});
