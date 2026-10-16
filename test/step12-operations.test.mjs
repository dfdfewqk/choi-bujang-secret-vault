import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleOperations} from '../src/operations-api.mjs';
import {observeApi} from '../src/api-observation.mjs';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function output(){return {headers:new Map(),code:0,body:null,setHeader(k,v){this.headers.set(k.toLowerCase(),v);},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};}
test('observations correlate real status and DB timestamp without logging payload or credentials',async()=>{
 const res=output(),calls=[];
 await observeApi({method:'PUT',headers:{authorization:'Bearer synthetic-never-log'},body:{body:'Synthetic hidden content'}},res,
  {route:'notes.item',databaseFactory:()=>({rpc:async(name,p)=>{calls.push({name,p});return {data:{checkedAt:'2026-10-15T02:00:00Z'},error:null};}}),
   handler:async(_req,r,context)=>{context.onOwnerVerified(owner);return r.status(403).json({error:'APP_SIGNATURE_INVALID',body:'hidden'});}});
 assert.equal(res.code,403);assert.equal(res.headers.get('x-audit-recorded'),'true');
 assert.equal(res.headers.get('x-checked-at'),'2026-10-15T02:00:00Z');
 assert.equal(calls[0].p.p_request,res.headers.get('x-request-id'));assert.equal(calls[0].p.p_owner,owner);
 assert.equal(calls[0].p.p_status,403);assert.equal(calls[0].p.p_error,'APP_SIGNATURE_INVALID');
 assert.doesNotMatch(JSON.stringify(calls),/synthetic-never-log|Synthetic hidden content|"body"/u);
});
test('failed audit never turns a denied response into success or a saved-record claim',async()=>{
 const res=output();
 await observeApi({method:'GET'},res,{route:'notes.collection',databaseFactory:()=>({rpc:async()=>{throw Error('unavailable');}}),
  handler:async(_req,r)=>r.status(401).json({error:'UNAUTHORIZED'})});
 assert.equal(res.code,401);assert.equal(res.headers.get('x-audit-recorded'),'false');
});
function fixture(){
 let reads=0;
 const data={measuredAt:'2026-10-15T02:00:00Z',totalObservations:1,
  observations:[{requestId:'11111111-1111-4111-8111-111111111111',checkedAt:'2026-10-15T02:00:00Z',method:'GET',route:'notes.item',actualStatus:404,scope:'account',body:'do not expose',owner_id:owner}],
  recentReads:[{at:new Date().toISOString(),method:'GET'}],deviceState:{pending:1,approved:2,revoked:0,expired:0,publicKey:'do not expose'},restoreCount:0};
 const db={rpc:async()=>{reads++;return {data,error:null};}};
 return {db,get reads(){return reads;}};
}
async function invoke({auth=true,principal={kind:'student',userId:owner},approved=true,method='GET',query={}}={}){
 const f=fixture(),res=output();
 await handleOperations({method,query,headers:auth?{authorization:'Bearer synthetic'}:{}},res,{databaseFactory:()=>f.db,
  verifyAuthorization:async()=>principal,appVerification:async()=>({ok:approved,error:'DEVICE_NOT_APPROVED'})});
 return {res,f};
}
test('anonymous, invalid login, unapproved device, and query probes reveal no operation records',async()=>{
 for(const options of [{auth:false},{principal:null},{approved:false},{query:{owner:owner}},{method:'POST'}]){
  const {res,f}=await invoke(options);assert.ok([400,401,403,405].includes(res.code));assert.equal(f.reads,0);
  assert.equal(res.body.observations,undefined);
 }
});
test('approved account receives scoped redacted data, never fabricated 41 passes or live revocations',async()=>{
 const {res,f}=await invoke();assert.equal(res.code,200);assert.equal(f.reads,1);
 assert.equal(res.body.observations[0].actualStatus,404);assert.equal(res.body.observations[0].source,'server_api');
 assert.equal(res.body.officialCampaign.total,41);assert.equal(res.body.officialCampaign.executed,null);
 assert.equal(res.body.detection.apiReadCount,1);assert.equal(res.body.detection.apiEvaluation.action,'observe');
 assert.equal(res.body.detection.liveEvents,null);assert.equal(res.body.revocation.identityExecution,'not_connected');
 assert.equal(res.body.recovery.completed,0);assert.equal(res.body.recovery.latestAt,null);
 assert.equal(res.body.rules.policyStatus,'ready');assert.doesNotMatch(JSON.stringify(res.body),/do not expose|owner_id|publicKey/u);
});
test('actual Stage12 bundle and legacy wrapper produce the same 5-field observations',async()=>{
 const prior=globalThis.fetch;let count=0;
 try{
  globalThis.fetch=async url=>{
   count++;
   const path=new URL(url).pathname;
   if(path==='/aleph.json')return new Response('{"step":12}',{status:200});
   if(path==='/')return new Response(null,{status:200,headers:{'x-content-type-options':'nosniff'}});
   if(path==='/data.json')return new Response(null,{status:404});
   if(path==='/api/restore')return new Response(null,{status:405});
   return new Response(null,{status:401});
  };
  const {runAttackChecks}=await import('../src/attack-check.mjs');
  const {runStage12PublicReadOnlyChecks}=await import('../src/stage12-bundle-check.mjs');
  const config=(await import('../aleph.config.json',{with:{type:'json'}})).default;
  const first=await runAttackChecks(config),second=await runStage12PublicReadOnlyChecks(config);
  assert.deepEqual(first,second);
  assert.equal(count,16);
  assert.equal(first.length,20);
  assert.equal(first.filter(x=>x.result==='not_run').length,12);
  assert.equal(first.filter(x=>x.result==='blocked').length,8);
  assert.ok(first.every(x=>Object.keys(x).sort().join(',')==='attackId,expected,observed,result,stage'));
 }finally{globalThis.fetch=prior;}
});
test('app client signs operations GET; API verifies it, queries snapshot and records the same request',async()=>{
 const previous=globalThis.fetch;let registration,approved=false;const used=new Set(),audits=[];
 const db={rpc:async(name,p)=>{
  if(name==='byteback_register_app_device'){registration={deviceId:p.p_device,publicKey:p.p_key};return {data:{...registration,status:'pending'}};}
  if(name==='byteback_device_status')return {data:{...registration,status:approved?'approved':'pending'}};
  if(name==='byteback_consume_app_nonce'){const ok=approved&&!used.has(p.p_nonce);if(ok)used.add(p.p_nonce);return {data:ok};}
  if(name==='byteback_operations_snapshot'){assert.equal(p.p_owner,owner);return {data:{measuredAt:new Date().toISOString(),observations:[],recentReads:[],deviceState:{approved:1},restoreCount:0,totalObservations:audits.length}};}
  if(name==='byteback_record_api_observation'){audits.push(p);return {data:{checkedAt:'2026-10-15T02:00:00Z'}};}
  throw Error('unexpected RPC');
 }};
 try{
  const {handleDevice}=await import('../src/device-api.mjs');
  globalThis.fetch=async(url,options)=>{
   const u=new URL(url,'https://fixture.invalid'),r=output();
   const req={method:options.method??'GET',headers:Object.fromEntries(new Headers(options.headers)),query:Object.fromEntries(u.searchParams),body:options.body?JSON.parse(options.body):undefined};
   const deps={verifyAuthorization:async()=>({kind:'student',userId:owner}),databaseFactory:()=>db};
   if(u.pathname==='/api/device')await handleDevice(req,r,deps);
   else await observeApi(req,r,{route:'operations',databaseFactory:()=>db,handler:(rq,rs,context)=>handleOperations(rq,rs,{...deps,...context})});
   return new Response(JSON.stringify(r.body),{status:r.code,headers:Object.fromEntries(r.headers)});
  };
  const app=await import('../public/device-client.mjs?stage12=integration');
  await app.requestApproval('synthetic-operation-login');approved=true;await app.approvalStatus('synthetic-operation-login');
  const response=await app.signedFetch('/api/operations',{token:'synthetic-operation-login'});
  assert.equal(response.status,200);assert.equal((await response.json()).revocation.deviceState.approved,1);
  assert.equal(response.headers.get('X-Audit-Recorded'),'true');assert.equal(audits[0].p_request,response.headers.get('X-Request-Id'));
  assert.equal(audits[0].p_status,200);assert.equal(audits[0].p_owner,owner);
  approved=false;const denied=await app.signedFetch('/api/operations',{token:'synthetic-operation-login'});
  assert.equal(denied.status,403);app.clearDevice();
 }finally{globalThis.fetch=previous;}
});
