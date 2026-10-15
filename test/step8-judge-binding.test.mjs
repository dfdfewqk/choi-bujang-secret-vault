// Synthetic identities only: no real Auth tokens, private notes or secrets.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ownerForJudge,verifiedOwnerId} from '../src/verified-owner.mjs';
import {handleNotes} from '../src/notes-api.mjs';
import {decide} from '../src/decider.mjs';
import {fixtureRequests} from '../scripts/fixture-7.mjs';

const STUDENT_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STUDENT_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STUDENT_NOTE='11111111-1111-4111-8111-111111111111';
const RUN='22222222-2222-4222-8222-222222222222';
const SUB='99999999-9999-4999-8999-999999999999';
const SECRET='UNIT_TEST_PLACEHOLDER_2026';
const judge=(identity,runId=RUN)=>({kind:'judge',userId:SUB,runId,identity});
const student=userId=>({kind:'student',userId});

function database(){
 const rows=[{note_uuid:STUDENT_NOTE,owner_id:STUDENT_A,
   title:'Student A',content:'Synthetic sample'}];
 const calls=[];
 return {rows,calls,from(name){
  assert.equal(name,'vault_training_notes');
  const eqs={};let op='select',updated;
  const matches=row=>Object.entries(eqs).every(([k,v])=>row[k]===v);
  const q={
   select(){return q;},order(){return q;},eq(k,v){eqs[k]=v;return q;},
   async maybeSingle(){
    calls.push({op,filters:{...eqs}});
    const i=rows.findIndex(matches);
    if(i<0)return {data:null,error:null};
    if(op==='update')Object.assign(rows[i],updated);
    return {data:{...rows[i]},error:null};
   },
   async limit(n){
    calls.push({op:'list',filters:{...eqs}});
    return {data:rows.filter(matches).slice(0,n).map(x=>({...x})),error:null};
   },
   async insert(v){calls.push({op:'insert',input:{...v}});rows.push({...v});return {error:null};},
   update(v){op='update';updated={...v};return q;},
   delete(){op='delete';return q;},
   then(resolve,reject){
    calls.push({op,filters:{...eqs}});
    const data=[];
    for(let i=rows.length-1;i>=0;i--)if(op==='delete'&&matches(rows[i])){
      data.push({note_uuid:rows.splice(i,1)[0].note_uuid});
    }
    return Promise.resolve({data,error:null}).then(resolve,reject);
   }
  };return q;
 }};
}
function response(){
 return {code:0,body:null,setHeader(){return this;},
  status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
}
async function invoke({db,verified,id=null,method='GET',body={},headers={}}){
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://fixture.invalid';
 process.env.SUPABASE_SECRET_KEY=SECRET;
 const res=response();
 try{
  await handleNotes({
   method,body,query:id?{id}:undefined,
   headers:{authorization:'Bearer fixture.token.notreal',...headers},
  },res,{
   itemId:id,verifyAuthorization:async()=>verified,
   databaseFactory:()=>db,
  });
 }finally{
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
 return res;
}
test('a signed judge run A/B receives separate pseudonymous owners, not student users',async()=>{
 const a=ownerForJudge(judge('a'),SECRET);
 const b=ownerForJudge(judge('b'),SECRET);
 const another=ownerForJudge(judge('a','33333333-3333-4333-8333-333333333333'),SECRET);
 assert.match(a,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
 assert.notEqual(a,b);
 assert.notEqual(a,another);
 assert.notEqual(a,STUDENT_A);
 assert.notEqual(b,STUDENT_B);
 assert.equal(ownerForJudge(judge('a'),SECRET),a);
 assert.equal(ownerForJudge({...judge('a'),identity:'admin'},SECRET),null);
 assert.equal(ownerForJudge({...judge('a'),runId:null},SECRET),null);
 assert.equal(await verifiedOwnerId(student(STUDENT_A),database()),STUDENT_A);
});
test('student remains on own userId; judge cannot read student A sample',async()=>{
 const db=database();
 assert.equal((await invoke({db,verified:student(STUDENT_A),id:STUDENT_NOTE})).code,200);
 assert.equal((await invoke({db,verified:student(STUDENT_B),id:STUDENT_NOTE})).code,404);
 for(const name of ['a','b']){
  const foreign=await invoke({db,verified:judge(name),id:STUDENT_NOTE});
  assert.equal(foreign.code,404);
  assert.deepEqual(foreign.body,{error:'NOT_FOUND'});
 }
});
test('judge A creates own note; judge B, student A and other runs all receive 404',async()=>{
 const db=database();
 const create=await invoke({db,verified:judge('a'),method:'POST',
  body:{title:'Judge A',body:'Synthetic judge-created note'}});
 assert.equal(create.code,201);
 const id=create.body.id;
 assert.equal(db.rows.find(x=>x.note_uuid===id).owner_id,ownerForJudge(judge('a'),SECRET));
 const own=await invoke({db,verified:judge('a'),id});
 assert.equal(own.code,200);
 assert.equal(own.body.id,id);
 for(const verified of [judge('b'),student(STUDENT_A),
    judge('a','33333333-3333-4333-8333-333333333333')]){
  assert.equal((await invoke({db,verified,id})).code,404);
 }
 const list=await invoke({db,verified:judge('b')});
 assert.equal(list.code,200);
 assert.deepEqual(list.body.notes,[]);
 const forbidden=await invoke({db,verified:judge('b'),id,method:'PUT',
  body:{title:'Other',body:'Overwrite'}});
 assert.equal(forbidden.code,404);
 assert.equal((await invoke({db,verified:judge('b'),id,method:'DELETE'})).code,404);
 assert.equal((await invoke({db,verified:judge('a'),id,method:'DELETE'})).code,200);
 assert.equal((await invoke({db,verified:judge('a'),id})).code,404);
});
test('spoofed role and malformed judge claims cannot choose real student ownership',async()=>{
 const db=database(),baseline=db.rows.length;
 for(const verified of [
  {...judge('a'),identity:'admin'},
  {...judge('b'),runId:undefined},
  {...judge('a'),kind:'guest'},
 ]){
  const res=await invoke({db,verified,id:STUDENT_NOTE,headers:{'x-role':'instructor'}});
  assert.equal(res.code,403);
  assert.equal(res.body.error,'OWNER_BINDING_UNAVAILABLE');
 }
 assert.equal(db.rows.length,baseline);
});
test('judge cannot clone someone else’s object ID',async()=>{
 const db=database();
 for(const key of ['id','note_uuid']){
  const res=await invoke({db,verified:judge('b'),method:'POST',
   body:{title:'clone',body:'clone',[key]:STUDENT_NOTE}});
  assert.equal(res.code,400);
  assert.equal(res.body.error,'CLIENT_NOTE_ID_NOT_ALLOWED');
 }
 assert.equal(db.rows.length,1);
});
test('pure SDP denies broad note lists and delegates UUID owner check to final API',async()=>{
 const {normal}=fixtureRequests();
 const canonical={...normal,path:'/api/notes/'+STUDENT_NOTE,
   route:'GET /api/notes/:id',method:'GET',service:'notes'};
 const res=await decide(canonical);
 assert.equal(res.decision,'allow');
 assert.deepEqual(res.ruleIds,['device_registered','resource_zone']);
 const collection=await decide({...canonical,path:'/api/notes',
   route:'GET /api/notes'});
 assert.equal(collection.decision,'deny');
 assert.equal(collection.reasonCode,'resource_not_allowed');
 assert.equal((await decide(normal)).decision,'allow');
 assert.equal((await decide({...canonical,deviceRegistered:false})).decision,'deny');
});
