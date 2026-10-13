import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {decide} from '../xdr/persistence/decide.mjs';
import {readAlerts} from '../xdr/persistence/read-alerts.mjs';
import {planResponses,createZtnaDenyGate} from '../xdr/persistence/respond.mjs';
const data=JSON.parse(await readFile(new URL('../xdr/fixtures/persistence.json',import.meta.url),'utf8'));
test('five columns and 24 rows',async()=>{const {inputCount,lines}=await readAlerts();
 assert.equal(inputCount,24);assert.equal(lines.length,24);for(const x of lines)assert.equal(Object.keys(x).length,5);});
test('patterns have one-line MITRE evidence',async()=>{const p=JSON.parse(await readFile(new URL('../xdr/persistence/patterns.json',import.meta.url),'utf8'));
 const c=await readFile(new URL('../xdr/persistence/decide.mjs',import.meta.url),'utf8');
 for(const r of p.patterns){assert.match(r.evidence,/MITRE ATT&CK T/u);assert.doesNotMatch(r.evidence,/[\r\n]/u);assert.ok(c.includes(JSON.stringify(r.name)));}
 assert.doesNotMatch(c,/\bimport\b|\breadFile\b|\bwriteFile\b/u);});
test('24 classifications 8/8/8, normal 0 blocked',()=>{const d=data.alerts.map(decide),c=d.reduce((o,x)=>(o[x.action]++,o),{block:0,alert:0,record:0});
 assert.deepEqual(c,{block:8,alert:8,record:8});d.forEach((x,i)=>assert.equal(x.action,i<8?'block':i<16?'alert':'record',data.alerts[i].id));
 const fake=structuredClone(data.alerts[0]);fake.rule.mitre=[];assert.notEqual(decide(fake).action,'block');});
test('seven 15-min expiring denies; normal shared IP protected',async()=>{
 const now=new Date('2026-09-27T08:00:00Z'),p=planResponses(data.alerts,{now});
 assert.equal(p.denyRules.length,7);assert.equal(p.alertLogLines.length,16);
 for(const x of p.denyRules){assert.equal(x.effect,'deny');assert.equal(x.expiresAt,new Date(now.valueOf()+900000).toISOString());}
 const normal=structuredClone(data.alerts[16]);normal.data.srcip=data.alerts[0].data.srcip;
 assert.equal(planResponses([data.alerts[0],normal]).denyRules.length,0);
 const gate=createZtnaDenyGate({baseDecide:async()=>({decision:'allow'}),denyRules:p.denyRules,
 trustedSourceIp:c=>c?.verifiedSourceIp,now:()=>now.valueOf()+1000});
 assert.equal((await gate({}, {verifiedSourceIp:data.alerts[0].data.srcip})).blocked,true);
 assert.equal((await gate({}, {verifiedSourceIp:data.alerts[16].data.srcip})).blocked,false);
});
