import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/checks.js';
import {evaluateReadOnlyCase,READ_ONLY_CASES} from '../src/stage12-readonly-fixtures.mjs';

const output=()=>({
 statusCode:0,body:null,headers:new Map(),
 setHeader(k,v){this.headers.set(k.toLowerCase(),v);},
 status(v){this.statusCode=v;return this;},
 json(v){this.body=v;return this;},
});
test('all eleven fixed public-read cases evaluate the actual local engines',async()=>{
 assert.equal(READ_ONLY_CASES.length,11);
 assert.equal(new Set(READ_ONLY_CASES).size,11);
 for(const caseId of READ_ONLY_CASES){
  const result=await evaluateReadOnlyCase(caseId);
  assert.deepEqual(result,{schema:'aleph.readonly.fixture.v1',
   caseId,source:'fixed_virtual_fixture',ready:true},caseId);
 }
 assert.equal(await evaluateReadOnlyCase('stage8_announcement_edit_denied'),null);
});
test('GET-only endpoint reports provenance but no fake official judge result',async()=>{
 for(const caseId of READ_ONLY_CASES){
  const res=output();
  await handler({method:'GET',query:{case:caseId},headers:{}},res);
  assert.equal(res.statusCode,200,caseId);
  assert.equal(res.body?.ready,true,caseId);
  assert.equal(res.body?.source,'fixed_virtual_fixture');
  assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  assert.doesNotMatch(JSON.stringify(res.body),/officialCampaign|owner_id|credential|Bearer/u);
 }
});
test('unsupported, malformed, and all write requests are denied without executing a fixture',async()=>{
 for(const method of ['POST','PUT','PATCH','DELETE','HEAD']){
  const res=output();
  await handler({method,query:{case:READ_ONLY_CASES[0]}},res);
  assert.equal(res.statusCode,405);
  assert.equal(res.body.error,'METHOD_NOT_ALLOWED');
 }
 for(const query of [{case:'stage8_announcement_edit_denied'},
   {case:'stage9_121_burst',anything:'extra'},
   {case:['stage9_121_burst']}]){
  const res=output();
  await handler({method:'GET',query},res);
  assert.equal(res.statusCode,400);
  assert.equal(res.body.error,'INVALID_READ_ONLY_CASE');
 }
});
