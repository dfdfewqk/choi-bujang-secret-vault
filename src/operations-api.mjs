import config from '../aleph.config.json' with {type:'json'};
import {detect} from './detect.mjs';
import {RULE_IDS} from './decider.mjs';
import {comparePolicy} from './restore-policy.mjs';
import {createLoginVerifier} from './verify-login.mjs';
import {verifiedOwnerId} from './verified-owner.mjs';
import {verifyAppRequest} from './app-request.mjs';
import {auditDatabase,deployedCommit,routeExpectation} from './api-observation.mjs';
let verifier;
export async function handleOperations(req,res,{verifyAuthorization,databaseFactory=auditDatabase,appVerification=verifyAppRequest,onOwnerVerified=()=>{}}={}){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 if(Object.keys(req.query??{}).length)return res.status(400).json({error:'INVALID_QUERY'});
 const auth=req.headers?.authorization;
 if(typeof auth!=='string'||!auth.startsWith('Bearer '))return res.status(401).json({error:'UNAUTHORIZED'});
 try{
  verifier??=verifyAuthorization?null:createLoginVerifier({config,supabaseSecretKey:process.env.SUPABASE_SECRET_KEY});
  const principal=await (verifyAuthorization??verifier)(auth);
  if(!principal)return res.status(401).json({error:'UNAUTHORIZED'});
  const db=databaseFactory(),owner=await verifiedOwnerId(principal,db);
  if(!owner)return res.status(403).json({error:'OWNER_BINDING_UNAVAILABLE'});
  onOwnerVerified(owner);
  const proof=await appVerification({request:req,owner,db,path:'/api/operations'});
  if(proof?.ok!==true)return res.status(403).json({error:proof?.error??'APP_SIGNATURE_REQUIRED'});
  const {data,error}=await db.rpc('byteback_operations_snapshot',{p_owner:owner});
  if(error||!data)throw Error('snapshot unavailable');
  const policy=await comparePolicy();
  // The DB query is scoped to one verified owner. This is a student API feed,
  // not the provider engine's event stream or a revocation execution claim.
  const apiEvents=Array.isArray(data.recentReads)?data.recentReads.slice(0,2000).map(e=>({at:e.at,method:e.method,identity:{sub:'scoped_account'}})):null;
  const evaluation=apiEvents?detect(apiEvents):null;
  // Explicit allowlist prevents a DB/adapter mistake from exposing private fields.
  const observations=Array.isArray(data.observations)?data.observations.slice(0,100).map(row=>({
   requestId:row.requestId,checkedAt:row.checkedAt,method:row.method,route:row.route,
   expected:routeExpectation(row.route),actualStatus:row.actualStatus,errorCode:row.errorCode??null,
   commit:row.commit??null,scope:row.scope==='account'?'account':'anonymous',source:'server_api',
  })):[];
  return res.status(200).json({schema:'byteback.operations.v1',measuredAt:data.measuredAt,
   deploymentCommit:deployedCommit(),step:config.step,
   engine:{name:'ALEPH SDP 엔진',source:'제공 엔진',liveDecisionFeed:'not_connected'},
   rules:{configured:[...RULE_IDS],policyStatus:policy.status,baselineCommit:policy.baselineCommit??null,
    backupVersion:policy.backupVersion??null,backupSha256:policy.backupSha256??null,source:'server_policy_verification'},
   detection:{rule:'동일 주체의 10분 GET 120건 초과 시 회수 제안',liveEvents:null,status:'engine_feed_not_connected',source:'src/detect.mjs',
    apiReadCount:apiEvents?.length??null,apiEvaluation:evaluation?{action:evaluation.action,reasonCode:evaluation.reasonCode??null}:null,apiEventSource:apiEvents?'verified_notes_api_audit':'unavailable'},
   revocation:{identityExecution:'not_connected',deviceState:Object.fromEntries(['pending','approved','revoked','expired'].map(k=>[k,Number(data.deviceState?.[k]??0)])),source:'server_database'},
   recovery:{completed:Number(data.restoreCount??0),latestAt:data.latestRestoreAt??null,
    latestVersionHash:data.latestRestoreHash??null,source:'restore_audit'},
   observations,totalObservations:Number(data.totalObservations??0),
   officialCampaign:{total:41,executed:null,status:'not_connected',note:'공식 41종 시험 결과 미연결. 자체 점검과 합산하지 않습니다.'},
  });
 }catch{return res.status(503).json({error:'OPERATIONS_UNAVAILABLE'});}
}
