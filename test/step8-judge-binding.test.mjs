// All identities, JWT principal objects and notes below are synthetic.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifiedOwnerId } from '../src/verified-owner.mjs';
import { handleNotes } from '../src/notes-api.mjs';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOTE='11111111-1111-4111-8111-111111111111';
const RUN='22222222-2222-4222-8222-222222222222';
const principal=identity=>({kind:'judge',identity,runId:RUN,userId:RUN});
const users=[
 {id:A,created_at:'2026-01-01T00:00:00Z',email_confirmed_at:'yes',last_sign_in_at:'yes'},
 {id:B,created_at:'2026-01-02T00:00:00Z',email_confirmed_at:'yes',last_sign_in_at:'yes'},
];
function fakeDb(profiles=users){
 let lookupCount=0,readCount=0;
 const db={
  auth:{admin:{async listUsers(opts){
    assert.deepEqual(opts,{page:1,perPage:3});
    lookupCount++;
    return {data:{users:profiles},error:null};
  }}},
  from(table){
    assert.equal(table,'vault_training_notes');
    const clauses={};
    const chain={
      select(){return chain;},
      eq(key,value){clauses[key]=value;return chain;},
      async maybeSingle(){
        readCount++;
        const present=clauses.note_uuid===NOTE && clauses.owner_id===A;
        return {data:present?{note_uuid:NOTE,title:'Example',content:'Synthetic'}:null,error:null};
      }
    };
    return chain;
  }
 };
 return {db,lookupCount:()=>lookupCount,readCount:()=>readCount};
}
function response(){
 return {statusCode:0,body:null,setHeader(){return this;},
  status(n){this.statusCode=n;return this;},
  json(v){this.body=v;return this;}};
}
async function callWith({db,verified,query={id:NOTE},headers={}}){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://placeholder.invalid';
 process.env.SUPABASE_SECRET_KEY='UNIT_TEST_PLACEHOLDER';
 const res=response();
 try{
  await handleNotes({method:'GET',
    headers:{authorization:'Bearer mock.signature.value',...headers},query},res,{
      itemId:NOTE,verifyAuthorization:async()=>verified,databaseFactory:()=>db,
    });
 } finally{
  if(url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=url;
  if(key===undefined)delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY=key;
 }
 return res;
}
test('trusted signed-judge A/B mapping differs from ephemeral JWT sub',async()=>{
 const {db}=fakeDb();
 assert.equal(await verifiedOwnerId(principal('a'),db),A);
 assert.equal(await verifiedOwnerId(principal('b'),db),B);
 assert.notEqual(principal('a').userId,A);
 assert.equal(await verifiedOwnerId({kind:'student',userId:A},db),A);
});
test('specific A note: signed judge A gets 200, signed judge B gets 404',async()=>{
 const {db,lookupCount}=fakeDb();
 const own=await callWith({db,verified:principal('a')});
 assert.equal(own.statusCode,200);
 assert.equal(own.body.id,NOTE);
 const foreign=await callWith({db,verified:principal('b')});
 assert.equal(foreign.statusCode,404);
 assert.deepEqual(foreign.body,{error:'NOT_FOUND'});
 assert.equal(lookupCount(),2);
});
test('student tokens use unchanged ownership binding',async()=>{
 const {db,lookupCount}=fakeDb();
 assert.equal((await callWith({db,verified:{kind:'student',userId:A}})).statusCode,200);
 assert.equal((await callWith({db,verified:{kind:'student',userId:B}})).statusCode,404);
 assert.equal(lookupCount(),0);
});
test('unsigned browser role cannot supply trusted owner binding',async()=>{
 const {db,readCount}=fakeDb();
 for(const verified of [
   {...principal('a'),identity:'admin'},
   {...principal('b'),identity:'A'},
   {...principal('a'),runId:undefined},
   {...principal('a'),kind:'guest'},
 ]) {
  const result=await callWith({db,verified,headers:{'x-role':'instructor'}});
  assert.equal(result.statusCode,403);
  assert.equal(result.body.error,'OWNER_BINDING_UNAVAILABLE');
 }
 assert.equal(readCount(),0);
});
test('unknown A/B registry fails closed without revealing notes',async()=>{
 for(const entries of [
    [],[users[0]],[...users, {...users[1],id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}],
    [{...users[0],email_confirmed_at:null},users[1]],
    [{...users[0],id:B},users[1]],
 ]){
  const {db,readCount}=fakeDb(entries);
  const res=await callWith({db,verified:principal('a')});
  assert.equal(res.statusCode,403);
  assert.equal(readCount(),0);
 }
});

test('S08 end-to-end: identical canonical note gate, A gets own data and B receives 404',async()=>{
  const {normal}=fixtureRequests();
  const canonical={
    ...normal,service:'notes',method:'GET',
    path:'/api/notes/'+NOTE,route:'GET /api/notes/:id',
  };
  const first=await decide(canonical);
  assert.equal(first.decision,'allow');
  assert.deepEqual(first.ruleIds,['device_registered','resource_zone']);
  const {db}=fakeDb();
  const a=await callWith({db,verified:principal('a')});
  const b=await callWith({db,verified:principal('b')});
  assert.equal(a.statusCode,200);
  assert.equal(b.statusCode,404);
  assert.deepEqual(b.body,{error:'NOT_FOUND'});
  // The same resource is never accessible without passing both gates.
  assert.equal((await decide({...canonical,deviceRegistered:false})).decision,'deny');
  assert.equal((await decide({...canonical,path:'/api/notes/export'})).decision,'deny');
  assert.equal((await decide({...canonical,service:'announcements'})).decision,'deny');
});
