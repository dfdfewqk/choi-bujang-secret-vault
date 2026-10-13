import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decide} from '../xdr/known-cve/decide.mjs';
import {readAlerts,projectAlerts} from '../xdr/known-cve/read-alerts.mjs';
import {planResponses,processXdrResponses,createZtnaDenyGate}
 from '../xdr/known-cve/respond.mjs';

const fixture=JSON.parse(await readFile(new URL('../xdr/fixtures/known-cve.json',import.meta.url),'utf8'));
const doc=JSON.parse(await readFile(new URL('../xdr/known-cve/patterns.json',import.meta.url),'utf8'));

test('24 Wazuh events project to 24 safe five-column diagnostic rows',async()=>{
 const {inputCount,lines}=await readAlerts();
 assert.equal(inputCount,24);
 assert.equal(lines.length,fixture.alerts.length);
 assert.deepEqual(Object.keys(lines[0]).sort(),
  ['timestamp','sourceAddress','account','ruleLevel','description'].sort());
 assert.equal(lines[0].sourceAddress,'203.0.113.10');
 assert.equal(lines[0].account,'[미기록]');
 assert.equal(lines[16].account,'user01');
 const tainted=structuredClone(fixture.alerts[0]);
 tainted.rule.description='Authorization: Bearer secret-should-stay-private';
 tainted.data.srcuser='learner@example.invalid';
 const [safe]=projectAlerts({...fixture,alerts:[tainted]});
 assert.equal(safe.description,'[비밀값 제외]');
 assert.equal(safe.account,'[미기록]');
 assert.doesNotMatch(JSON.stringify(safe),/secret-should-stay-private|learner@example/u);
});

test('pattern names and one-line evidence match the isolated detector',async()=>{
 assert.equal(doc.schema,'byteback.xdr.known-cve.patterns.v1');
 assert.equal(doc.mitre,'T1190');
 assert.equal(doc.cve,'CVE-2021-44228');
 assert.equal(doc.patterns.length,3);
 const code=await readFile(new URL('../xdr/known-cve/decide.mjs',import.meta.url),'utf8');
 for(const rule of doc.patterns){
  assert.ok(rule.name.length>3);
  assert.ok(rule.condition.length>15);
  assert.match(rule.evidence,/CVE-2021-44228|MITRE ATT&CK T1190/u);
  assert.doesNotMatch(rule.evidence,/[\r\n]/u);
  assert.ok(code.includes(JSON.stringify(rule.name)));
 }
 for(const unsafe of [/\bimport\b/u,/\brequire\s*\(/u,/\bfetch\s*\(/u,
   /\breadFile\b/u,/\bwriteFile\b/u,/\bprocess\./u,/\bexec\s*\(/u]){
  assert.doesNotMatch(code,unsafe);
 }
});

test('clear Log4Shell patterns block, ambiguous CVE patterns alert, normal records only',()=>{
 const results=fixture.alerts.map(decide);
 assert.deepEqual(results.reduce((acc,r)=>{acc[r.action]++;return acc;},
  {block:0,alert:0,record:0}),{block:8,alert:8,record:8});
 for(let i=0;i<results.length;i++){
  const r=results[i],id=fixture.alerts[i].id;
  assert.deepEqual(Object.keys(r).sort(),['action','confidence','reason'].sort());
  assert.ok(Number.isFinite(r.confidence)&&r.confidence>=0&&r.confidence<=1);
  assert.equal(r.action,r.confidence>=0.85?'block':r.confidence>=0.5?'alert':'record',id);
  if(i<8)assert.equal(r.action,'block',id);
  if(i>=8&&i<16)assert.equal(r.action,'alert',id);
  if(i>=16)assert.equal(r.action,'record',id);
 }
 assert.equal(decide(null).action,'record');
 assert.equal(decide({}).action,'record');
});

test('No automatic IP block for search words, severity alone or spoofed high counts',()=>{
 const normal=fixture.alerts[16];
 const suspicious=structuredClone(fixture.alerts[0]);
 suspicious.data.useragent='CVE-2021-44228 article';
 assert.notEqual(decide(suspicious).action,'block');
 suspicious.data.useragent='training documentation';
 suspicious.data.count='999';
 assert.notEqual(decide(suspicious).action,'block');
 suspicious.rule.mitre=[];
 assert.notEqual(decide(suspicious).action,'block');
 assert.equal(decide(normal).action,'record');
 const phrase=structuredClone(fixture.alerts[0]);
 phrase.data.useragent='jndi classroom note';
 assert.equal(decide(phrase).action,'alert');
});

test('XDR responder yields 7 expiring deny rules and 16 minimal alert logs',()=>{
 const now=new Date('2026-09-27T08:00:00Z');
 const plan=planResponses(fixture.alerts,{now});
 assert.equal(plan.reviewed,24);
 assert.deepEqual(plan.counts,{block:8,alert:8,record:8});
 assert.equal(plan.denyRules.length,7);
 assert.equal(plan.suppressedNormalSourceBlocks,0);
 assert.equal(plan.alertLogLines.length,16);
 const normalIps=new Set(fixture.alerts.slice(16).map(a=>a.data.srcip));
 for(const rule of plan.denyRules){
  assert.equal(rule.effect,'deny');
  assert.equal(normalIps.has(rule.sourceIp),false);
  assert.equal(rule.createdAt,now.toISOString());
  assert.equal(rule.expiresAt,new Date(now.valueOf()+900000).toISOString());
  assert.ok(rule.evidenceAlertIds.length>=1);
  assert.ok(rule.evidenceAlertIds.every(id=>/^kc-\d\d$/u.test(id)));
 }
 assert.deepEqual(plan.denyRules.find(x=>x.sourceIp==='203.0.113.10').evidenceAlertIds,
  ['kc-01','kc-02']);
 for(const line of plan.alertLogLines){
  const row=JSON.parse(line);
  assert.ok(row.action==='alert'||row.action==='block');
  assert.deepEqual(Object.keys(row).sort(),
    ['action','alertId','at','confidence','reason'].sort());
  assert.doesNotMatch(line,/srcip|srcuser|token|password|jndi:|203\.0\.113/u);
 }
});

test('Normal request sharing an IP suppresses broad IP block',()=>{
 const normal=structuredClone(fixture.alerts[16]);
 normal.data.srcip=fixture.alerts[0].data.srcip;
 const plan=planResponses([fixture.alerts[0],normal]);
 assert.equal(plan.denyRules.length,0);
 assert.equal(plan.suppressedNormalSourceBlocks,1);
 assert.equal(JSON.parse(plan.alertLogLines[0]).action,'alert');
});

test('ZTNA preserves existing policies for normal and expired rules',async()=>{
 const now=new Date('2026-09-27T08:00:00Z');
 const rules=planResponses(fixture.alerts,{now}).denyRules;
 let delegated=0;
 const baseDecide=async req=>{delegated++;return {decision:'allow',requestId:req.requestId};};
 const gate=createZtnaDenyGate({baseDecide,denyRules:rules,
  trustedSourceIp:ctx=>ctx?.verifiedSourceIp,now:()=>now.valueOf()+1000});
 const blocked=await gate({requestId:'synthetic'},{verifiedSourceIp:fixture.alerts[0].data.srcip});
 assert.equal(blocked.blocked,true);
 assert.equal(blocked.stage,'xdr-pre-gate');
 assert.equal(delegated,0);
 const normal=await gate({requestId:'synthetic',sourceIp:fixture.alerts[0].data.srcip},
  {verifiedSourceIp:fixture.alerts[16].data.srcip});
 assert.equal(normal.blocked,false);
 assert.equal(normal.decision.decision,'allow');
 assert.equal(delegated,1);
 const expired=createZtnaDenyGate({baseDecide,denyRules:rules,
  trustedSourceIp:ctx=>ctx?.verifiedSourceIp,now:()=>now.valueOf()+16*60000});
 assert.equal((await expired({requestId:'synthetic'},
  {verifiedSourceIp:fixture.alerts[0].data.srcip})).blocked,false);
});

test('Runtime files are written separately, without logging raw Wazuh fields',async()=>{
 const root=await mkdtemp(join(tmpdir(),'byteback-xdr03-'));
 try{
  const plan=await processXdrResponses({root,alerts:fixture.alerts,
    now:new Date('2026-09-27T08:00:00Z')});
  const log=await readFile(join(root,'xdr','alerts.log'),'utf8');
  const rules=JSON.parse(await readFile(join(root,'xdr','known-cve','deny-rules.runtime.json'),'utf8'));
  assert.equal(log.trim().split('\n').length,16);
  assert.equal(rules.rules.length,7);
  assert.equal(plan.denyRules.length,7);
  assert.doesNotMatch(log,/Authorization|Bearer |password=|token=|srcip|srcuser|jndi:|203\.0\.113/u);
 }finally{await rm(root,{recursive:true,force:true});}
});
