// Verified pre-incident *policy facts* from Git commit 94df01d95cd0.
// Safe policy source remains Git; HTTP does NOT overwrite live decider code.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {decide,RULE_IDS} from './decider.mjs';
const BACKUP_URL=new URL('../backups/stage9-safe-policy.json',import.meta.url);
const EXPECTED_SHA256='973ce57614be98d0e6f0f624af75147474fe33069104fed0efe8b1edc033b9f6';
function clone(value){return JSON.parse(JSON.stringify(value));}
function readVerifiedSnapshot(readBackup=()=>readFileSync(BACKUP_URL,'utf8')){
 const snapshot=JSON.parse(readBackup());
 if(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')!==EXPECTED_SHA256)
  throw new Error('Policy backup integrity failed');
 return snapshot;
}
export function safePolicySnapshot(){return clone(readVerifiedSnapshot());}
export function policySnapshotVerified(){
 try{readVerifiedSnapshot();return true;}catch{return false;}
}
export async function comparePolicy({decideFn=decide,ruleIds=RULE_IDS,readBackup}={}){
 let SNAPSHOT;
 try{SNAPSHOT=readVerifiedSnapshot(readBackup);}catch{return {status:'invalid_backup'};}
 const expected=SNAPSHOT.ruleIds, observed=Array.isArray(ruleIds)?[...ruleIds]:[];
 const diff=[];
 if(JSON.stringify(expected)!==JSON.stringify(observed))diff.push('ruleIds');
 const base={
  schema:'aleph.decision.v1',requestId:'11111111-1111-4111-8111-111111111111',
  classId:'class_fixture',projectId:'project_fixture',subjectId:'learner_fixture',
  deviceId:'aaaaaaaaaaaaaaaa',service:'notes',method:'GET',
  path:'/notes/demo',route:'GET /notes/:id',
  queryLength:0,querySha256:createHash('sha256').update('').digest('hex'),
  at:new Date().toISOString(),policyRevision:1,deviceRegistered:true,
  stepUp:{verified:false,authAgeSeconds:null},recentEvents:[],
  signals:{source:'judge_fixture',region:'local',network:'usual',hour:14},
 };
 const suspicious={...base,signals:{source:'judge_fixture',region:'foreign',
   network:'unusual',hour:3},
   recentEvents:[{kind:'risk_signal',ageSeconds:60,count:20}]};
 const checks=[
  ['normalNote',base],['unregistered',{...base,deviceRegistered:false}],
  ['unfamiliarBurst',suspicious],
  ['listRead',{...base,path:'/notes',route:'GET /notes'}],
  ['noticeWrite',{...base,service:'announcements',method:'PUT',
    path:'/announcements/11111111-1111-4111-8111-111111111111',
    route:'PUT /announcements/:id'}],
  ['objectRead',{...base,path:'/notes/11111111-1111-4111-8111-111111111111'}],
 ];
 for(const [key,req] of checks){
  try{
   const out=await decideFn(req);
   if(out?.decision!==SNAPSHOT[key]||out?.requestId!==req.requestId
     ||out?.schema!=='aleph.decision.v1'
     ||Object.keys(out??{}).sort().join(',')!=='decision,reasonCode,requestId,ruleIds,schema'
     ||!Array.isArray(out.ruleIds)
     ||out.ruleIds.some(id=>!expected.includes(id)))diff.push(key);
  }catch{diff.push(key);}
 }
 return {
  status:diff.length?'policy_diff':'ready',baselineCommit:SNAPSHOT.sourceCommit,
  backupSha256:EXPECTED_SHA256,backupVerified:true,backupVersion:SNAPSHOT.version,changedItems:diff
 };
}
// Only for isolated trial-policy objects. Actual production policy is immutable
// application code and may be recovered solely through a reviewed Git deploy.
export function restoreTrialPolicy(current,preview){
 if(!current||typeof current!=='object'||preview?.status!=='ready'
     ||!policySnapshotVerified())return {status:'blocked'};
 return {status:'restored',policy:safePolicySnapshot()};
}
