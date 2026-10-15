import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {handleRestore} from '../src/restore-api.mjs';
import {safePolicySnapshot,policySnapshotVerified,comparePolicy,restoreTrialPolicy}
 from '../src/restore-policy.mjs';
const RUN='11111111-1111-4111-8111-111111111111';
const SUB='22222222-2222-4222-8222-222222222222';
const A_NOTE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B_NOTE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function principal(kind='judge',identity='b'){
 return {kind,identity,userId:SUB,runId:RUN};
}
function response(){
 const headers=new Map();
 return {statusCode:0,body:null,headers,
  setHeader(k,v){headers.set(k.toLowerCase(),v);return this;},
  status(v){this.statusCode=v;return this;},
  json(v){this.body=v;return this;}};
}
function dbFixture(){
 // Exactly the pre-incident B state was captured BEFORE tampering.
 const baseline={id:B_NOTE,title:'B safe',body:'Safe synthetic text',ownerId:null};
 const rows=new Map([[A_NOTE,{ownerId:'A',title:'A safe',body:'Do not touch'}]]);
 const audit=[];
 const calls=[];
 const db={rows,audit,calls,backup:baseline,
  rpc:async(name,p)=>{
   calls.push({name,...p});
   if(p.p_note&&p.p_note!==B_NOTE)return {data:{status:'missing'},error:null};
   const snapshot=db.backup;
   if(!snapshot)return {data:{status:'missing'},error:null};
   const current=rows.get(B_NOTE);
   if(current&&current.ownerId!==p.p_owner)return {data:{status:'owner_conflict'},error:null};
   const cleanHash=createHash('sha256').update(snapshot.title+snapshot.body).digest('hex');
   if(snapshot.corrupt)return {data:{status:'invalid_backup'},error:null};
   if(name==='byteback_preview_note_restore'){
    return {data:{status:'ready',id:B_NOTE,hash:cleanHash,
      capturedAt:'2026-10-01T00:00:00Z',deleted:!current,
      changed:!current||current.title!==snapshot.title||current.body!==snapshot.body},
      error:null};
   }
   if(name!=='byteback_restore_one_note')return {data:null,error:{message:'bad RPC'}};
   rows.set(B_NOTE,{ownerId:p.p_owner,title:snapshot.title,body:snapshot.body});
   audit.push({id:B_NOTE,hash:cleanHash,wasDeleted:!current});
   return {data:{status:'restored',id:B_NOTE,hash:cleanHash,
      ownerVerified:true,wasDeleted:!current},error:null};
  }};
 return db;
}
async function invoke(db,{identity='b',kind='judge',auth=true,id=B_NOTE,
 method='POST',body,policyCheck}={}){
 const prevUrl=process.env.SUPABASE_URL,prevKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://fixture.invalid';
 process.env.SUPABASE_SECRET_KEY='TEST_RECOVERY_SIGNING_PLACEHOLDER_2026';
 const r=response();
 const payload=body===undefined?(id?{id}:{}):body;
 try{
  await handleRestore({method,body:payload,headers:auth?{authorization:'Bearer fixture'}:{}},
  r,{verifyAuthorization:async()=>principal(kind,identity),
      databaseFactory:()=>db,policyCheck:policyCheck??comparePolicy});
 }finally{
  if(prevUrl===undefined)delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=prevUrl;
  if(prevKey===undefined)delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY=prevKey;
 }
 return r;
}
test('trusted policy baseline has pinned digest and preserves 6-9 decisions',async()=>{
 assert.equal(policySnapshotVerified(),true);
 const p=await comparePolicy();
 assert.equal(p.status,'ready');
 assert.deepEqual(p.changedItems,[]);
 assert.equal(p.baselineCommit,'94df01d95cd04f7c608cbce60c6fed9dcc38b86b');
 const suspicious={...safePolicySnapshot(),ruleIds:['fake','resource_zone']};
 const trial=restoreTrialPolicy(suspicious,p);
 assert.equal(trial.status,'restored');
 assert.deepEqual(trial.policy,safePolicySnapshot());
 assert.deepEqual(suspicious.ruleIds,['fake','resource_zone']);
});
test('trial policy backup corrupt/active rules changed -> fail-closed',async()=>{
 assert.equal((await comparePolicy({ruleIds:['resource_zone']})).status,'policy_diff');
 const p=await comparePolicy({decideFn:async()=>({decision:'allow'})});
 assert.equal(p.status,'policy_diff');
 assert.deepEqual(restoreTrialPolicy({},p),{status:'blocked'});
});
test('preview returns only backup hash/metadata, without backup content',async()=>{
 const db=dbFixture();
 const r=await invoke(db,{method:'GET'});
 assert.equal(r.statusCode,200);
 assert.equal(r.body.status,'ready');
 assert.equal(r.body.id,B_NOTE);
 assert.equal(r.body.deleted,true);
 assert.equal(typeof r.body.backupHash,'string');
 assert.equal(JSON.stringify(r.body).includes('Safe synthetic text'),false);
 assert.deepEqual(db.audit,[]);
});
test('B mutated note restores only own validated note, preserves A and audit append',async()=>{
 const db=dbFixture(),ownerA=structuredClone(db.rows.get(A_NOTE));
 // The test B owner comes from server-verifiable per-run identity.
 const probe=await invoke(db,{method:'POST'});
 assert.equal(probe.statusCode,200);
 const bOwner=db.rows.get(B_NOTE).ownerId;
 db.rows.set(B_NOTE,{ownerId:bOwner,title:'Tampered',body:'Tampered'});
 const restore=await invoke(db);
 assert.equal(restore.statusCode,200);
 assert.equal(restore.body.restored,true);
 assert.equal(restore.body.wasDeleted,false);
 assert.equal(db.rows.get(B_NOTE).title,'B safe');
 assert.equal(db.rows.get(B_NOTE).body,'Safe synthetic text');
 assert.deepEqual(db.rows.get(A_NOTE),ownerA);
 assert.equal(db.audit.length,2);
});
test('B deleted note restores exactly same ID, owner and original text',async()=>{
 const db=dbFixture();
 const first=await invoke(db);
 const before=structuredClone(db.rows.get(B_NOTE));
 assert.equal(first.statusCode,200);
 db.rows.delete(B_NOTE);
 const restored=await invoke(db,{body:{noteId:B_NOTE}});
 assert.equal(restored.statusCode,200);
 assert.equal(restored.body.wasDeleted,true);
 assert.deepEqual(db.rows.get(B_NOTE),before);
 assert.deepEqual(db.audit.map(x=>x.id),[B_NOTE,B_NOTE]);
 assert.equal(db.rows.has(A_NOTE),true);
});
test('A, ordinary students, missing JWT may never call restore RPC',async()=>{
 const db=dbFixture();
 for(const opts of [{identity:'a'},{kind:'student'},{auth:false}]){
  const res=await invoke(db,opts);
  assert.ok([401,403].includes(res.statusCode));
 }
 assert.equal(db.calls.length,0);
});
test('unknown ID, poisoned backup, owner collision fail without writes',async()=>{
 const db=dbFixture();
 assert.equal((await invoke(db,{id:randomUUID()})).statusCode,404);
 db.backup.corrupt=true;
 assert.equal((await invoke(db)).body.error,'BACKUP_INTEGRITY_FAILED');
 db.backup.corrupt=false;
 db.rows.set(B_NOTE,{ownerId:'foreign',title:'Foreign',body:'Foreign'});
 assert.equal((await invoke(db)).body.error,'OWNER_CONFLICT');
 assert.equal(db.audit.length,0);
});
test('path or body cannot spoof owner, target, or bulk restore',async()=>{
 const db=dbFixture();
 for(const bad of [
  {id:B_NOTE,ownerId:'A'}, {id:B_NOTE,noteId:A_NOTE},
  {id:B_NOTE,restoreAll:true},{id:'invalid'},
 ]){
  const r=await invoke(db,{body:bad});
  assert.equal(r.statusCode,400);
 }
 assert.equal(db.calls.length,0);
});
test('backup or policy not validated => fail closed with no write',async()=>{
 const db=dbFixture();
 const r=await invoke(db,{policyCheck:async()=>({status:'policy_diff'})});
 assert.equal(r.statusCode,409);
 assert.equal(r.body.error,'POLICY_BACKUP_NOT_VERIFIED');
 db.backup=null;
 assert.equal((await invoke(db)).statusCode,404);
 assert.equal(db.audit.length,0);
});
test('B sole backup may be selected without ID, no bulk restore',async()=>{
 const db=dbFixture();
 const r=await invoke(db,{id:null,body:{}});
 assert.equal(r.statusCode,200);
 assert.equal(db.audit.length,1);
});
