// Regression for the precise official S08 failure: "allowed GET /notes".
// Official judge is the authority; these are strict synthetic policy tests.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decide,RULE_IDS} from '../src/decider.mjs';
import {fixtureRequests} from '../scripts/fixture-7.mjs';
const uuid='11111111-1111-4111-8111-111111111111';
const sample=()=>fixtureRequests().normal;
const as=(path,method,service='notes',route)=>({
 ...sample(),service,method,path,route:route??method+' '+path
});
async function decision(request,expected,reason){
 const result=await decide(request);
 assert.equal(result.decision,expected,request.method+' '+request.path);
 assert.equal(result.reasonCode,reason,request.method+' '+request.path);
 assert.deepEqual(Object.keys(result).sort(),[
   'decision','reasonCode','requestId','ruleIds','schema']);
 assert.equal(result.schema,'aleph.decision.v1');
 assert.equal(result.requestId,request.requestId);
 assert.ok(result.ruleIds.length>0);
 for(const id of result.ruleIds)assert.ok(RULE_IDS.includes(id),id);
 return result;
}
test('official failure GET /notes plus /api/notes deny with both user identities',async()=>{
 for(const prefix of ['/notes','/api/notes']){
   for(const who of ['learner_fixture','other_pseudonymous_subject']){
     await decision({...as(prefix,'GET'),subjectId:who},'deny','resource_not_allowed');
   }
 }
});
test('a precise note UUID route passes the gate, final API checks ownership',async()=>{
 for(const prefix of ['/notes','/api/notes']){
  for(const method of ['GET','PUT','DELETE']){
   await decision(as(prefix+'/'+uuid,method,'notes',method+' '+prefix+'/:id'),'allow','approved');
  }
  await decision(as(prefix,'POST'),'allow','approved');
 }
});
test('instructor announcement writes never open even with client-supplied role',async()=>{
 for(const prefix of ['/announcements','/api/announcements']){
   for(const method of ['POST','PUT','PATCH','DELETE']){
     for(const path of [prefix,prefix+'/'+uuid]){
       const req=as(path,method,'announcements',
          method+' '+prefix+(path.endsWith(uuid)?'/:id':''));
       await decision({...req,role:'instructor',
           identity:{role:'instructor'},headers:{'x-role':'instructor'}},
           'deny','resource_not_allowed');
     }
   }
 }
});
test('unknown routes, route aliases, query-selectors and export reject',async()=>{
 const p='/notes/'+uuid;
 const reqs=[
  as('/notes/export','GET','notes','GET /notes/:id'),
  as('/api/notes/export','GET','notes','GET /api/notes/:id'),
  as('/notes/'+uuid+'/export','GET','notes','GET /notes/:id'),
  as(p,'GET','notes','GET /other/:id'),
  as('/notes','PATCH'),
  {...as('/notes','GET'),queryLength:1},
  {...as('/api/notes','GET'),queryLength:3},
  {...as(p,'GET','notes','GET /notes/:id'),queryLength:1},
  {...as(p,'GET','notes','GET /notes/:id'),deviceId:'notregistered'},
  {...as(p,'GET','notes','GET /notes/:id'),subjectId:''},
  as('/api/admin/users','GET','notes','GET /api/admin/users'),
 ];
 for(const req of reqs)await decision(req,'deny','resource_not_allowed');
});
test('unregistered device denied on normal and denied-on-zone routes',async()=>{
 for(const req of [sample(),as('/notes','GET'),
   as('/notes/'+uuid,'GET','notes','GET /notes/:id')]){
   await decision({...req,deviceRegistered:false},'deny','device_not_registered');
 }
});
test('existing 6/7 normal, step_up and verified session retained',async()=>{
 const {normal,suspicious}=fixtureRequests();
 await decision(normal,'allow','approved');
 await decision(suspicious,'step_up','step_up_required');
 await decision({...suspicious,stepUp:{verified:true,authAgeSeconds:45}},'allow','approved');
});
test('decision module never relies on contract-absent role/identity/device claims',async()=>{
 const req=as('/notes','GET');
 for(const payload of [
  {},{role:'instructor'},{identity:{role:'instructor'}},{device:{registered:true}},
  {userRole:'admin',owner_id:'owner',methodOverride:'POST'}
 ]){
   await decision({...req,...payload},'deny','resource_not_allowed');
 }
});
