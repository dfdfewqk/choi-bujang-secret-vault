// Operator-only device approval API. Ordinary students cannot grant this privilege.
import {createClient} from '@supabase/supabase-js';
import config from '../aleph.config.json' with {type:'json'};
import {createLoginVerifier} from './verify-login.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DEVICE=/^[a-f0-9]{16}$/;
let verifier;
function send(res,status,data){return res.status(status).json(data);}
function dbClient(){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw Error('NOT_CONFIGURED');
 return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export async function handleAdminDevices(req,res,{verifyAuthorization,createDatabase=dbClient}={}){
 res.setHeader('Cache-Control','no-store, private');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
 const origin=req.headers?.origin,host=req.headers?.host;
 if(origin){let url;try{url=new URL(origin);}catch{return send(res,403,{error:'ORIGIN_NOT_ALLOWED'});}
  if(url.protocol!=='https:'||url.host!==host)return send(res,403,{error:'ORIGIN_NOT_ALLOWED'});}
 const bearer=req.headers?.authorization;
 if(typeof bearer!=='string'||bearer.length>8200||!bearer.startsWith('Bearer '))return send(res,401,{error:'UNAUTHORIZED'});
 let body=req.body;
 if(typeof body==='string'){if(body.length>2048)return send(res,413,{error:'INVALID_BODY'});try{body=JSON.parse(body);}catch{return send(res,400,{error:'INVALID_BODY'});}}
 if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{error:'INVALID_BODY'});
 const action=body.action;
 const keys=action==='list'?['action']:['action','ownerId','deviceId'];
 if(!['list','approve','reject'].includes(action)||Object.keys(body).length!==keys.length||keys.some(k=>!Object.hasOwn(body,k)))return send(res,400,{error:'INVALID_ACTION'});
 if(action!=='list'&&(!UUID.test(body.ownerId??'')||!DEVICE.test(body.deviceId??'')))return send(res,400,{error:'INVALID_DEVICE'});
 let principal;
 try{verifier??=verifyAuthorization?null:createLoginVerifier({config,supabaseSecretKey:process.env.SUPABASE_SECRET_KEY});principal=await (verifyAuthorization??verifier)(bearer);}
 catch{return send(res,401,{error:'UNAUTHORIZED'});}
 if(principal?.kind!=='student'||!UUID.test(principal.userId??''))return send(res,403,{error:'ADMIN_REQUIRED'});
 try{
  const db=createDatabase(),name=action==='list'?'byteback_admin_pending_devices':'byteback_admin_decide_device';
  const params=action==='list'?{p_actor:principal.userId,p_limit:25}:{p_actor:principal.userId,p_owner:body.ownerId,p_device:body.deviceId,p_approve:action==='approve'};
  const {data,error}=await db.rpc(name,params);
  if(error){
   if(error.code==='42501'||error.message?.includes('operator permission'))return send(res,403,{error:'ADMIN_REQUIRED'});
   if(error.code==='P0002')return send(res,409,{error:'REQUEST_NOT_PENDING'});
   return send(res,503,{error:'ADMIN_SERVICE_UNAVAILABLE'});
  }
  if(action==='list'){
   if(!Array.isArray(data)||data.length>25||!data.every(x=>UUID.test(x?.ownerId??'')&&DEVICE.test(x?.deviceId??'')&&x.status==='pending'&&typeof x.createdAt==='string'&&typeof x.expiresAt==='string'))return send(res,502,{error:'ADMIN_RESULT_INVALID'});
   return send(res,200,{requests:data});
  }
  if(!data||data.deviceId!==body.deviceId||data.status!==(action==='approve'?'approved':'revoked'))return send(res,502,{error:'ADMIN_RESULT_INVALID'});
  return send(res,200,{deviceId:data.deviceId,status:data.status});
 }catch{return send(res,503,{error:'ADMIN_SERVICE_UNAVAILABLE'});}
}