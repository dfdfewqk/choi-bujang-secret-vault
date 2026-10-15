import {createClient} from '@supabase/supabase-js';
import config from '../aleph.config.json' with {type:'json'};
import {createLoginVerifier} from './verify-login.mjs';
import {verifiedOwnerId} from './verified-owner.mjs';
import {publicDeviceKey} from './app-request.mjs';
let verifier;
export async function handleDevice(request,response,{verifyAuthorization,databaseFactory}={}){
 response.setHeader('Cache-Control','no-store');
 response.setHeader('Content-Type','application/json; charset=utf-8');
 response.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(request.method))return response.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const auth=request.headers?.authorization;
 if(typeof auth!=='string'||!auth.startsWith('Bearer '))return response.status(401).json({error:'UNAUTHORIZED'});
 try{
  verifier??=verifyAuthorization?null:createLoginVerifier({config,supabaseSecretKey:process.env.SUPABASE_SECRET_KEY});
  const principal=await (verifyAuthorization??verifier)(auth);
  if(!principal)return response.status(401).json({error:'UNAUTHORIZED'});
  const db=databaseFactory?databaseFactory():createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const owner=await verifiedOwnerId(principal,db);
  if(!owner)return response.status(403).json({error:'OWNER_BINDING_UNAVAILABLE'});
  let rpc,args;
  if(request.method==='POST'){
   if(!request.body||Object.keys(request.body).join(',')!=='publicKey')return response.status(400).json({error:'INVALID_DEVICE_REQUEST'});
   let parsed;try{parsed=publicDeviceKey(request.body.publicKey);}catch{return response.status(400).json({error:'INVALID_PUBLIC_KEY'});}
   rpc='byteback_register_app_device';
   // Signed judge identities are isolated test operators, never student accounts.
   args={p_owner:owner,p_device:parsed.deviceId,p_key:parsed.key,p_trial:principal.kind==='judge'};
  }else{
   const query=request.query??{};
   if(Object.keys(query).join(',')!=='id'||! /^[a-f0-9]{16}$/u.test(query.id??''))return response.status(400).json({error:'INVALID_DEVICE_ID'});
   rpc='byteback_device_status';args={p_owner:owner,p_device:query.id};
  }
  const {data,error}=await db.rpc(rpc,args);if(error)throw error;
  return response.status(200).json({deviceId:data?.deviceId??args.p_device,
   status:['approved','pending','revoked','expired'].includes(data?.status)?data.status:'unknown',
   expiresAt:data?.expiresAt??null});
 }catch{return response.status(503).json({error:'DEVICE_SERVICE_UNAVAILABLE'});}
}
