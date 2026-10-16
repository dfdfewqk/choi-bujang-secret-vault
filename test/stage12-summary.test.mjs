import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/checks.js';
import {summarizeStage12Checks} from '../src/stage12-summary.mjs';
import {validateCheckSummary,loadOps} from '../public/receipt.mjs';

const cases=[
 {attackId:'public_data_removed',stage:2,expected:'public data absent',observed:'HTTP 404',result:'blocked'},
 {attackId:'anonymous_note_read_denied',stage:3,expected:'unauthenticated denied',observed:'HTTP 200',result:'breached'},
 {attackId:'stage8_announcement_edit_denied',stage:8,expected:'write request denied',observed:'not_run',result:'not_run'},
 {attackId:'stage9_121_burst',stage:9,expected:'burst detected',observed:'HTTP 200',result:'blocked'},
];
const stamp='2026-10-16T05:00:00.000Z',sha='a'.repeat(40);
const fixture=()=>summarizeStage12Checks(cases,{commit:sha,checkedAt:stamp,targetUrl:'https://example.vercel.app'});
const output=()=>({code:0,body:null,headers:new Map(),
 setHeader(name,value){this.headers.set(name.toLowerCase(),value);},
 status(value){this.code=value;return this;},
 json(value){this.body=value;return this;},
});
test('self-check totals use the exact same individual observed HTTP rows',()=>{
 const result=fixture();
 assert.deepEqual([result.total,result.blocked,result.failed,result.notRun],[4,2,1,1]);
 assert.equal(result.officialJudgeEvidence,false);
 assert.equal(result.records[1].result,'breached');
 assert.deepEqual(validateCheckSummary(result),result);
 assert.throws(()=>validateCheckSummary({...result,blocked:3}),/inconsistent|invalid/u);
 assert.throws(()=>validateCheckSummary({...result,officialJudgeEvidence:true}),/invalid/u);
});
test('missing or invented HTTP observations never become blocked results',()=>{
 const altered=cases.map(x=>({...x}));
 altered[0].observed=undefined;
 altered[1].observed='not_run';
 const data=summarizeStage12Checks(altered,{checkedAt:stamp});
 assert.deepEqual([data.blocked,data.failed,data.notRun],[1,0,3]);
 assert.equal(data.records[0].observed,'not_run');
 assert.equal(data.records[1].observed,'not_run');
 assert.throws(()=>summarizeStage12Checks([...cases,cases[0]]),/INVALID_STAGE12_CASE_ID/u);
});
test('public GET /api/checks returns a read-only summary from observed responses',async()=>{
 const res=output(),requests=[];
 await handler({method:'GET',query:{}},res,{
  runChecks:async(_config,opts)=>{requests.push(opts);return cases;},
  now:()=>Date.parse(stamp),
 });
 assert.equal(res.code,200);
 assert.equal(res.body.total,4);assert.equal(res.body.blocked,2);
 assert.equal(res.body.notRun,1);assert.equal(res.body.failed,1);
 assert.deepEqual(requests,[{concurrency:4}]);
 assert.equal(res.body.officialJudgeEvidence,false);
 assert.equal(res.headers.get('cache-control'),'no-store');
});
test('public summary API denies mutations and returns unavailable on failed measurement',async()=>{
 for(const method of ['POST','PUT','PATCH','DELETE']){
  const res=output();
  await handler({method,query:{}},res);
  assert.equal(res.code,405);
 }
 const res=output();
 await handler({method:'GET',query:{}},res,{
  runChecks:async()=>{throw Error('offline');},now:()=>Date.parse(stamp)
 });
 assert.equal(res.code,503);assert.equal(res.body.error,'CHECKS_UNAVAILABLE');
});
test('both views show verified counts and clear stale values on API failure',async()=>{
 const slots=Object.fromEntries(['total','blocked','failed','notRun'].map(k=>[k,{textContent:'X'}]));
 const stats={querySelector(selector){
  const m=/^\[data-k="([A-Za-z]+)"\]$/u.exec(selector);
  return m?slots[m[1]]:null;
 }};
 const meta={textContent:'old'};
 const root={querySelector(selector){
  if(selector==='#ops-stats')return stats;
  if(selector==='#ops-meta')return meta;
  return null;
 }};
 await loadOps(root,{fetcher:async()=>({ok:true,json:async()=>fixture()})});
 assert.deepEqual(Object.values(slots).map(x=>x.textContent),['4','2','1','1']);
 assert.match(meta.textContent,/공식 41종 결과는 별도/u);
 await loadOps(root,{fetcher:async()=>({ok:false,status:503})});
 assert.ok(Object.values(slots).every(x=>x.textContent==='-'));
 assert.match(meta.textContent,/수치를 표시하지 않습니다/u);
});
