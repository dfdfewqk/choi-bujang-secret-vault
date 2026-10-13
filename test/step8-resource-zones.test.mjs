import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decide,RULE_IDS} from '../src/decider.mjs';
import {fixtureRequests} from '../scripts/fixture-7.mjs';
import {classifyRequestResource,noteResourceId,announcementResourceId} from '../src/resource-zones.mjs';
import {handleNotes} from '../src/notes-api.mjs';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const fixture=(fields={})=>({...fixtureRequests().normal,...fields});
const note=(method='GET',id=A)=>fixture({
 service:'notes',method,path:'/notes/'+id,route:method+' /notes/:id'
});
const notice=(method='PUT')=>fixture({
 service:'announcements',method,path:'/announcements/'+A,route:method+' /announcements/:id'
});
test('Resource namespaces do not overlap and use stable UUIDs',()=>{
 assert.equal(noteResourceId(A),'note:'+A);
 assert.equal(announcementResourceId(A),'announcement:'+A);
 assert.notEqual(noteResourceId(A),announcementResourceId(A));
 assert.deepEqual(classifyRequestResource(note()),{zone:'note',resourceId:'note:'+A,action:'GET'});
 assert.equal(classifyRequestResource(notice()).resourceId,'announcement:'+A);
});
test('Stage 6 and 7 are retained',async()=>{
 assert.deepEqual(RULE_IDS,['device_registered','step_up_required','resource_zone']);
 const {normal,suspicious}=fixtureRequests();
 assert.equal((await decide(normal)).decision,'allow');
 assert.equal((await decide({...normal,deviceRegistered:false})).reasonCode,'device_not_registered');
 assert.equal((await decide(suspicious)).decision,'step_up');
 assert.equal((await decide({...suspicious,stepUp:{verified:true,authAgeSeconds:60}})).decision,'allow');
});
test('Canonical note UUID routes pass policy; final API independently enforces owner',async()=>{
 for(const method of ['GET','PUT','DELETE']){
   const approved=await decide(note(method));
   assert.equal(approved.decision,'allow');
   assert.equal(approved.reasonCode,'approved');
 }
 // The decider does not receive a verified note owner. Both requests pass
 // only the route/device gate; they are NOT authorized to receive note data.
 for(const subjectId of ['learner_fixture','other_pseudonymous_subject']){
   assert.equal((await decide({...note('GET'),subjectId})).decision,'allow');
 }
 // The final notes API rejects a different owner with JSON 404.
 for(const req of [
   note('GET','export'),note('GET','download'),note('PATCH'),
   {...note(),route:'GET /other/:id'}, {...note(),path:'/notes/'+A+'/export'},
   {...note(),queryLength:8}, {...note(),subjectId:''}, {...note(),deviceId:'bad'},
   notice(),notice('GET'),notice('DELETE'),
   {...notice(),role:'instructor',identity:{role:'instructor'},headers:{'x-role':'instructor'}},
   {...note('GET','demo'),classId:'unrelated_class',signals:{source:'none'}},
 ]){
   const r=await decide(req);
   assert.equal(r.decision,'deny');
   assert.equal(r.reasonCode,'resource_not_allowed');
 }
});
test('No query may enable export or replace a path ID in server note API',async()=>{
 const u=process.env.SUPABASE_URL,k=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://stub.supabase.co';
 process.env.SUPABASE_SECRET_KEY='TEST_PLACEHOLDER_NOT_A_KEY';
 try{
   let touched=0;
   for(const [itemId,query] of [[A,{id:A,export:'1'}],[A,{id:B}],[null,{action:'export'}]]){
     const response={code:0,body:null,setHeader(){return this;},status(n){this.code=n;return this;},json(o){this.body=o;return this;}};
     await handleNotes({method:'GET',headers:{authorization:'Bearer placeholder'},query},response,{
       itemId,verifyAuthorization:async()=>({kind:'student',userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),
       databaseFactory:()=>{touched++;throw Error('DB touched');}
     });
     assert.equal(response.code,400);
     assert.deepEqual(response.body,{error:'INVALID_RESOURCE_QUERY'});
   }
   assert.equal(touched,0);
 }finally{
   if(u===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=u;
   if(k===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=k;
 }
});

test('Allowed collection/demo fixture and server-side actual owner-read behavior stay separate',async()=>{
 assert.equal((await decide(fixture({
   service:'notes',method:'GET',path:'/notes',route:'GET /notes'
 }))).decision,'allow');
 const fixtureNormal=fixtureRequests().normal;
 assert.equal((await decide(fixtureNormal)).decision,'allow');
 // Stage 4 tests assert same-owner GET 200 and cross-owner GET 404 at the
 // server API's verified.userId + owner_id predicate; no untrusted shortcut.
});
