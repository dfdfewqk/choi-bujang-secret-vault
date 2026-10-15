import {createClient} from '@supabase/supabase-js';
import config from '../aleph.config.json' with {type:'json'};
import {createLoginVerifier} from './verify-login.mjs';
import {verifiedOwnerId} from './verified-owner.mjs';
import {comparePolicy} from './restore-policy.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
let verifier;
const getVerifier=()=>verifier??(verifier=createLoginVerifier({
 config,supabaseSecretKey:process.env.SUPABASE_SECRET_KEY}));
const getDb=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
function header(request,key){return request.headers?.[key]??request.headers?.[key.toLowerCase()];}
function noteIdFrom(request){
 let body=request.body??{};
 if(typeof body==='string'){
  if(body.length>2048)return {error:true};
  try{body=JSON.parse(body);}catch{return {error:true};}
 }
 if(body===null)body={};
 if(!body||typeof body!=='object'||Array.isArray(body))return {error:true};
 const valid=['id','noteId','note_uuid','noteUuid'];
 if(Object.keys(body).some(key=>!valid.includes(key)))return {error:true};
 const query=request.query??{};
 if(typeof query!=='object'||Array.isArray(query)
   ||Object.keys(query).some(key=>!['id','noteId'].includes(key)))return {error:true};
 const values=[...valid.map(k=>body[k]),query.id,query.noteId].filter(x=>x!==undefined);
 if(values.length===0)return {id:null};
 if(values.some(x=>typeof x!=='string'||!UUID.test(x)))return {error:true};
 if(new Set(values.map(v=>v.toLowerCase())).size!==1)return {error:true};
 return {id:values[0].toLowerCase()};
}
function mapDbResponse(response,result,preview){
 const status=result?.status;
 if(status==='missing')return response.status(404).json({error:'BACKUP_NOT_FOUND'});
 if(status==='ambiguous')return response.status(409).json({error:'NOTE_ID_REQUIRED'});
 if(status==='invalid_backup')return response.status(409).json({error:'BACKUP_INTEGRITY_FAILED'});
 if(status==='owner_conflict')return response.status(409).json({error:'OWNER_CONFLICT'});
 if(status==='unavailable')return response.status(403).json({error:'RESTORE_UNAVAILABLE'});
 if(preview&&status==='ready'){
  return response.status(200).json({status:'ready',id:result.id,
   backupHash:result.hash,backupCapturedAt:result.capturedAt,
   deleted:result.deleted,changed:result.changed,policy:'verified',backupVerified:true});
 }
 if(!preview&&status==='restored'&&result.ownerVerified===true){
  return response.status(200).json({restored:true,id:result.id,
   sha256:result.hash,ownerVerified:true,wasDeleted:result.wasDeleted,
   policy:'verified',backupVerified:true});
 }
 return response.status(502).json({error:'RESTORE_UNAVAILABLE'});
}
export async function handleRestore(request,response,{
 verifyAuthorization=null,databaseFactory=getDb,policyCheck=comparePolicy,onOwnerVerified=()=>{}
}={}){
 response.setHeader('Cache-Control','no-store');
 response.setHeader('Content-Type','application/json; charset=utf-8');
 response.setHeader('X-Content-Type-Options','nosniff');
 const method=request.method?.toUpperCase();
 if(!['GET','POST'].includes(method)){
  response.setHeader('Allow','GET, POST');
  return response.status(405).json({error:'METHOD_NOT_ALLOWED'});
 }
 const auth=header(request,'authorization');
 if(typeof auth!=='string'||!auth.startsWith('Bearer ')){
  return response.status(401).json({error:'UNAUTHORIZED'});
 }
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY){
  return response.status(503).json({error:'SERVICE_NOT_CONFIGURED'});
 }
 let principal;
 try{principal=await (verifyAuthorization??getVerifier())(auth);}
 catch{return response.status(401).json({error:'UNAUTHORIZED'});}
 // The recovery experiment is restricted to signed judge B identities.
 // Ordinary students and judge A cannot restore or probe other owners.
 if(principal?.kind!=='judge'||principal.identity!=='b'
   ||typeof principal.userId!=='string'||!UUID.test(principal.userId)){
  return response.status(403).json({error:'RESTORE_NOT_AUTHORIZED'});
 }
 const target=noteIdFrom(request);
 if(target.error)return response.status(400).json({error:'INVALID_RESTORE_TARGET'});
 let policy;
 try{policy=await policyCheck();}catch{policy={status:'invalid_backup'};}
 if(policy?.status!=='ready'){
  return response.status(409).json({error:'POLICY_BACKUP_NOT_VERIFIED'});
 }
 try{
  const db=databaseFactory();
  const owner=await verifiedOwnerId(principal,db);
  if(!owner)return response.status(403).json({error:'OWNER_BINDING_UNAVAILABLE'});
  onOwnerVerified(owner);
  if(method==='POST'){
   // Re-read protected metadata before mutation; SQL rechecks under lock.
   const {data:plan,error:previewError}=await db.rpc('byteback_preview_note_restore',
     {p_owner:owner,p_note:target.id});
   if(previewError)throw previewError;
   if(plan?.status!=='ready')return mapDbResponse(response,plan,true);
   if(!UUID.test(plan.id??'')||!/^[a-f0-9]{64}$/u.test(plan.hash??'')
     ||(target.id&&plan.id!==target.id)){
    return response.status(409).json({error:'BACKUP_INTEGRITY_FAILED'});
   }
   target.id=plan.id;
  }
  const name=method==='GET'?'byteback_preview_note_restore':'byteback_restore_one_note';
  const {data,error}=await db.rpc(name,{p_owner:owner,p_note:target.id});
  if(error)throw error;
  return mapDbResponse(response,data,method==='GET');
 }catch{
  return response.status(502).json({error:'RESTORE_SERVICE_UNAVAILABLE'});
 }
}
