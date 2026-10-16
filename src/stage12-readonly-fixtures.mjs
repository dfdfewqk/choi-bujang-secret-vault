// Fixed, public, read-only checks. No credentials, user data, database or writes.
// These are synthetic unit inputs to the student's actual decider/detector,
// NOT claims of live SDP engine, device approval or official 41-attack results.
import {decide, RULE_IDS} from './decider.mjs';
import {detect} from './detect.mjs';

export const READ_ONLY_CASES=Object.freeze([
 'stage6_registered_device_allowed','stage6_unregistered_device_denied',
 'stage7_composite_step_up','stage7_recently_verified_allow',
 'stage8_unknown_route_denied','stage8_notes_list_denied',
 'stage8_api_notes_list_denied','stage9_120_normal',
 'stage9_121_burst','stage9_two_subjects','stage9_slow_requests',
]);
const DECISION_EXPECTED={
 stage6_registered_device_allowed:['allow','approved'],
 stage6_unregistered_device_denied:['deny','device_not_registered'],
 stage7_composite_step_up:['step_up','step_up_required'],
 stage7_recently_verified_allow:['allow','approved'],
 stage8_unknown_route_denied:['deny','resource_not_allowed'],
 stage8_notes_list_denied:['deny','resource_not_allowed'],
 stage8_api_notes_list_denied:['deny','resource_not_allowed'],
};
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const baseRequest=caseId=>({
 requestId:'readonly-'+caseId,subjectId:'learner_fixture',
 deviceId:'0123456789abcdef',deviceRegistered:true,
 service:'notes',method:'GET',path:'/notes/demo',route:'GET /notes/:id',
 queryLength:0,classId:'class_fixture',projectId:'project_fixture',
 signals:{source:'judge_fixture',hour:12,network:'usual'},recentEvents:[],
 stepUp:{verified:false},
});
function decisionRequest(caseId) {
 const request=baseRequest(caseId);
 if(caseId==='stage6_unregistered_device_denied')request.deviceRegistered=false;
 if(caseId==='stage8_unknown_route_denied') {
  request.path='/not-listed';request.route='GET /not-listed';
 }
 if(caseId==='stage8_notes_list_denied'){
  request.path='/notes';request.route='GET /notes';
 }
 if(caseId==='stage8_api_notes_list_denied'){
  request.path='/api/notes';request.route='GET /api/notes';
 }
 if(caseId==='stage7_composite_step_up'||caseId==='stage7_recently_verified_allow'){
  request.signals={source:'judge_fixture',hour:2,network:'unusual'};
  request.recentEvents=[{kind:'risk_signal',count:10,ageSeconds:30}];
  if(caseId==='stage7_recently_verified_allow')
   request.stepUp={verified:true,authAgeSeconds:60};
 }
 return request;
}
function readEvents(count,subject='fixture_a',spacingMs=2000){
 const start=Date.parse('2026-10-01T00:00:00.000Z');
 return Array.from({length:count},(_,i)=>({
  at:new Date(start+i*spacingMs).toISOString(),
  method:'GET',identity:{sub:subject},
 }));
}
function detectionEvents(caseId){
 if(caseId==='stage9_120_normal')return readEvents(120);
 if(caseId==='stage9_121_burst')return readEvents(121);
 if(caseId==='stage9_two_subjects')return [
  ...readEvents(100,'fixture_a'),...readEvents(100,'fixture_b')];
 if(caseId==='stage9_slow_requests')return readEvents(200,'fixture_a',7000);
 throw Error('Unknown read-only detector case');
}
export async function evaluateReadOnlyCase(caseId){
 if(!READ_ONLY_CASES.includes(caseId))return null;
 let ready=false;
 if(Object.hasOwn(DECISION_EXPECTED,caseId)){
  const request=decisionRequest(caseId);
  const response=await decide(request),[decision,reasonCode]=DECISION_EXPECTED[caseId];
  ready=response?.schema==='aleph.decision.v1'
   &&response?.requestId===request.requestId
   &&response?.decision===decision&&response?.reasonCode===reasonCode
   &&Array.isArray(response?.ruleIds)
   &&response.ruleIds.length>0&&response.ruleIds.every(rule=>RULE_IDS.includes(rule));
 }else{
  const result=detect(detectionEvents(caseId));
  const burst=caseId==='stage9_121_burst';
  ready=burst
   ?result?.action==='propose_revocation'&&result?.reasonCode==='burst_read'
    &&result?.subject==='fixture_a'
   :result?.action==='observe'&&Object.keys(result).length===1;
 }
 return {schema:'aleph.readonly.fixture.v1',caseId,source:'fixed_virtual_fixture',ready:Boolean(ready)};
}
