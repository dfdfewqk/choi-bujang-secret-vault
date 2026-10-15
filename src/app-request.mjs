import {createHash,createPublicKey,verify} from 'node:crypto';
import {canonical,signedMessage} from '../public/request-signature.mjs';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function publicDeviceKey(input){
 if(!input||input.kty!=='EC'||input.crv!=='P-256'||Object.hasOwn(input,'d')
   ||!/^[-_a-zA-Z0-9]{43}$/u.test(input.x??'')||!/^[-_a-zA-Z0-9]{43}$/u.test(input.y??''))throw Error('INVALID_PUBLIC_KEY');
 const key={kty:'EC',crv:'P-256',x:input.x,y:input.y};
 createPublicKey({key,format:'jwk'});
 return {key,deviceId:hash(canonical(key)).slice(0,16)};
}
export async function verifyAppRequest({request,owner,db,path,now=Date.now()}){
 const h=request.headers??{};
 const deviceId=h['x-byteback-app-device'],at=h['x-byteback-app-time'];
 const nonce=h['x-byteback-app-nonce'],signature=h['x-byteback-app-signature'];
 if([deviceId,at,nonce,signature].some(v=>typeof v!=='string')||!/^[a-f0-9]{16}$/u.test(deviceId??'')||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(at??'')
   ||!Number.isFinite(Date.parse(at))||Math.abs(now-Date.parse(at))>30000
   ||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(nonce??'')
   ||!/^[-_a-zA-Z0-9]{86}$/u.test(signature??''))return {ok:false,error:'APP_SIGNATURE_REQUIRED'};
 const {data:device,error}=await db.rpc('byteback_device_status',{p_owner:owner,p_device:deviceId});
 if(error)throw error;
 if(device?.status!=='approved')return {ok:false,error:'DEVICE_NOT_APPROVED'};
 const {key,deviceId:expected}=publicDeviceKey(device.publicKey);
 if(expected!==deviceId)return {ok:false,error:'APP_SIGNATURE_INVALID'};
 const method=request.method.toUpperCase();
 const message=signedMessage({deviceId,method,path,
  bodyHash:hash(canonical(['GET','DELETE'].includes(method)?undefined:request.body)),
  tokenHash:hash(h.authorization??''),at,nonce});
 if(!verify('sha256',Buffer.from(message),{key:createPublicKey({key,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')))
  return {ok:false,error:'APP_SIGNATURE_INVALID'};
 // Persisted atomic consume, shared across Vercel instances; repeat never writes notes.
 const {data:accepted,error:nonceError}=await db.rpc('byteback_consume_app_nonce',
  {p_owner:owner,p_device:deviceId,p_nonce:nonce,p_at:at});
 if(nonceError)throw nonceError;
 return accepted===true?{ok:true,deviceId}:{ok:false,error:'APP_REQUEST_REPLAY_OR_REVOKED'};
}
