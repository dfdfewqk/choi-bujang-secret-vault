// XDR-05 uses synthetic alerts only; no production identities or access data.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decide} from '../xdr/privilege/decide.mjs';
import {readAlerts,projectAlerts} from '../xdr/privilege/read-alerts.mjs';
import {planResponses,createZtnaDenyGate,processXdrResponses} from '../xdr/privilege/respond.mjs';
const fixture=JSON.parse(await readFile(new URL('../xdr/fixtures/privilege.json',import.meta.url),'utf8'));
test('26 Wazuh alerts yield exactly 26 redacted five-field rows',async()=>{
 const {inputCount,lines}=await readAlerts();
 assert.equal(inputCount,26);assert.equal(lines.length,26);
 for(const item of lines)assert.deepEqual(Object.keys(item),
  ['timestamp','sourceAddress','account','ruleLevel','description']);
 const unsafe=structuredClone(fixture);
 unsafe.alerts[0].rule.description='password=hidden';
 unsafe.alerts[0].data.srcuser='Bearer eyFake';
 const safe=projectAlerts(unsafe);
 assert.equal(safe[0].description,'[비밀값 제외]');
 assert.equal(safe[0].account,'[비공개]');
 assert.deepEqual(fixture.alerts[0].rule.description,
  'user01 이 원격 주소에서 관리자 그룹에 추가됐습니다.');
});
test('MITRE conditions have one-line evidence and standalone judge module has no imports',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../xdr/privilege/patterns.json',import.meta.url),'utf8'));
 const module=await readFile(new URL('../xdr/privilege/decide.mjs',import.meta.url),'utf8');
 assert.deepEqual(manifest.mitre,['T1068','T1078']);
 assert.equal(manifest.patterns.length,7);
 for(const p of manifest.patterns){
  assert.ok(typeof p.name==='string'&&p.name.length>2);
  assert.ok(typeof p.condition==='string'&&p.condition.length>15);
  assert.match(p.evidence,/MITRE ATT&CK T(?:1068|1078)/u);
  assert.doesNotMatch(p.evidence,/\r|\n/u);
  assert.ok(module.includes(JSON.stringify(p.name)));
 }
 assert.doesNotMatch(module,/\b(?:import|require|fetch|readFile|writeFile|appendFile)\b/u);
});
test('26 classified as 9 block, 8 alert, 9 record; no normal event is blocked',()=>{
 const all=fixture.alerts.map(decide);
 const counts=all.reduce((out,d)=>(out[d.action]++,out),{block:0,alert:0,record:0});
 assert.deepEqual(counts,{block:9,alert:8,record:9});
 for(let i=0;i<26;i++){
  const wanted=i<9?'block':i<17?'alert':'record';
  assert.equal(all[i].action,wanted,fixture.alerts[i].id);
  assert.ok(all[i].confidence>=0&&all[i].confidence<=1);
  assert.ok(typeof all[i].reason==='string'&&all[i].reason.length>1);
  if(all[i].action==='block')assert.ok(all[i].confidence>=0.85);
  if(all[i].action==='alert')assert.ok(all[i].confidence>=0.5&&all[i].confidence<0.85);
  if(all[i].action==='record')assert.ok(all[i].confidence<0.5);
 }
 for(const mod of [
  a=>{a.rule.mitre=[];},
  a=>{a.rule.level=5;},
  a=>{delete a.data.srcip;},
  a=>{a.rule.description='관리자 그룹은 아닙니다.';},
  a=>{a.data.group='project-week3';},
  a=>{a.rule.description='권한 상승 요청이 취소됐습니다.';},
 ]){
  const a=structuredClone(fixture.alerts[0]);mod(a);
  assert.notEqual(decide(a).action,'block');
 }
 assert.equal(decide(null).action,'record');
 assert.equal(decide({rule:{level:12}}).action,'record');
});
test('only strong alerts get expiring account + IP denies; shared normal session suppresses blocking',()=>{
 const now=new Date('2026-09-27T00:00:00Z');
 const out=planResponses(fixture.alerts,{now});
 assert.deepEqual(out.counts,{block:9,alert:8,record:9});
 assert.equal(out.reviewed,26);assert.equal(out.denyRules.length,8);
 assert.equal(out.alertLogLines.length,17);
 assert.ok(out.denyRules.every(x=>x.effect==='deny'&&x.verifiedAccount&&x.verifiedSourceIp
   &&x.evidenceAlertIds.length>0&&x.expiresAt===new Date(now.valueOf()+900000).toISOString()));
 assert.equal(out.denyRules.find(x=>x.verifiedAccount==='user01').evidenceAlertIds.length,2);
 const normal=structuredClone(fixture.alerts[17]);
 normal.data.srcuser=fixture.alerts[0].data.srcuser;
 normal.data.srcip=fixture.alerts[0].data.srcip;
 const same=planResponses([fixture.alerts[0],normal],{now});
 assert.equal(same.denyRules.length,0);
 assert.equal(same.suppressedNormalSourceBlocks,1);
});
test('separate pre-gate blocks only externally verified matching account+IP, expires and preserves base policy',async()=>{
 const now=new Date('2026-09-27T00:00:00Z').valueOf();
 const {denyRules}=planResponses(fixture.alerts,{now:new Date(now)});
 let invoked=0;
 const baseDecide=async()=>{invoked++;return {schema:'aleph.decision.v1',decision:'allow'};};
 const options={baseDecide,denyRules,trustedAccount:ctx=>ctx?.verifiedAccount,
  trustedSourceIp:ctx=>ctx?.verifiedSourceIp,now:()=>now+1000};
 const gate=createZtnaDenyGate(options);
 const probe={subjectId:'untrusted-in-request'};
 const bad=await gate(probe,{verifiedAccount:'user01',verifiedSourceIp:'203.0.113.11'});
 assert.equal(bad.blocked,true);assert.equal(bad.stage,'xdr-pre-gate');
 assert.equal(invoked,0);
 for(const context of [
  {verifiedAccount:'user02',verifiedSourceIp:'203.0.113.11'},
  {verifiedAccount:'user01',verifiedSourceIp:'192.0.2.76'},
  {verifiedAccount:null,verifiedSourceIp:'203.0.113.11'},
  {verifiedAccount:'admin01',verifiedSourceIp:'192.0.2.10'},
 ]){
  const good=await gate({...probe,srcuser:'user01',srcip:'203.0.113.11'},context);
  assert.equal(good.blocked,false);
  assert.equal(good.decision.decision,'allow');
 }
 assert.equal(invoked,4);
 const expired=createZtnaDenyGate({...options,now:()=>now+900001});
 assert.equal((await expired(probe,{verifiedAccount:'user01',
  verifiedSourceIp:'203.0.113.11'})).blocked,false);
});
test('responder writes redacted notices and runtime deny proposals only',async()=>{
 const root=await mkdtemp(join(tmpdir(),'xdr05-'));
 try{
  const plan=await processXdrResponses({root,alerts:fixture.alerts,now:new Date('2026-09-27T00:00:00Z')});
  const log=await readFile(join(root,'xdr','alerts.log'),'utf8');
  const rules=JSON.parse(await readFile(join(root,'xdr','privilege','deny-rules.runtime.json'),'utf8'));
  assert.equal(plan.denyRules.length,8);
  assert.equal(rules.rules.length,8);
  assert.equal(log.trim().split('\n').length,17);
  assert.doesNotMatch(log,/password=|Bearer\s+|sb_secret_|srcip|srcuser|203\.0\.113|198\.51\.100|192\.0\.2/u);
 }finally{await rm(root,{recursive:true,force:true});}
});
