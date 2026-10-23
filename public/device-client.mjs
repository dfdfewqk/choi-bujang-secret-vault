import {canonical,signedMessage} from './request-signature.mjs';
import {loadTrustedDevice,saveTrustedDevice,forgetTrustedDevice} from './device-store.mjs';
const enc=new TextEncoder();
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
let pair=null,deviceId=null,approved=false,ownerId=null,deviceGeneration=0;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function clearDevice(){deviceGeneration++;pair=null;deviceId=null;approved=false;ownerId=null;}
async function remoteStatus(token,id){
 const resp=await fetch('/api/device?id='+id,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
 const data=await resp.json();
 if(!resp.ok)throw Error(data.error??'DEVICE_STATUS_FAILED');
 if(data?.deviceId!==id||!['approved','pending','revoked','expired','unknown'].includes(data.status))throw Error('INVALID_DEVICE_STATUS');
 return data;
}
// Called only with the account ID verified by the same-origin /api/auth service.
// Returning null means no *reusable* key, never an implicit authorization.
export async function restoreDevice(token,verifiedOwnerId){
 if(!UUID.test(verifiedOwnerId??''))throw Error('계정 인증이 필요합니다.');
 clearDevice();
 const generation=deviceGeneration;
 const saved=await loadTrustedDevice(verifiedOwnerId);
 if(!saved)return null;
 if(saved.ownerId!==verifiedOwnerId||!/^[a-f0-9]{16}$/.test(saved.deviceId??'')
    ||saved.privateKey?.type!=='private'||saved.privateKey?.extractable!==false
    ||saved.privateKey?.algorithm?.namedCurve!=='P-256'||saved.publicKey?.type!=='public')
   throw Error('보관된 기기 인증키를 검증하지 못했습니다.');
 const jwk=await crypto.subtle.exportKey('jwk',saved.publicKey);
 const key={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
 if((await digest(canonical(key))).slice(0,16)!==saved.deviceId)throw Error('기기 인증키의 ID가 일치하지 않습니다.');
 const challenge=crypto.getRandomValues(new Uint8Array(32));
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},saved.privateKey,challenge);
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},saved.publicKey,signature,challenge))throw Error('보관된 기기 인증키를 검증하지 못했습니다.');
 const remote=await remoteStatus(token,saved.deviceId);
 if(deviceGeneration!==generation)throw Error('기기 인증 상태가 변경되었습니다.');
 if(!['approved','pending'].includes(remote.status)){
  await forgetTrustedDevice(verifiedOwnerId);
  return null;
 }
 pair={privateKey:saved.privateKey,publicKey:saved.publicKey};
 ownerId=verifiedOwnerId;deviceId=saved.deviceId;approved=remote.status==='approved';
 return remote;
}
export async function requestApproval(token,verifiedOwnerId){
 if(!UUID.test(verifiedOwnerId??''))throw Error('계정 인증이 필요합니다.');
 if(ownerId!==verifiedOwnerId)clearDevice();
 if(!pair){
  const restored=await restoreDevice(token,verifiedOwnerId);
  if(restored)return restored;
  pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const publicKey={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
  const expected=(await digest(canonical(publicKey))).slice(0,16);
  const resp=await fetch('/api/device',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({publicKey}),cache:'no-store'});
  const data=await resp.json();if(!resp.ok)throw Error(data.error??'DEVICE_REQUEST_FAILED');
  if(data.deviceId!==expected||!['pending','approved'].includes(data.status))throw Error('INVALID_DEVICE_REGISTRATION');
  deviceId=expected;ownerId=verifiedOwnerId;approved=data.status==='approved';
  await saveTrustedDevice(ownerId,{ownerId,deviceId,privateKey:pair.privateKey,publicKey:pair.publicKey});
  return data;
 }
 return approvalStatus(token);
}
export async function approvalStatus(token){
 if(!deviceId||!ownerId)return {status:'unknown'};
 try{
  const data=await remoteStatus(token,deviceId);
  approved=data.status==='approved';
  if(['expired','revoked','unknown'].includes(data.status)){
   await forgetTrustedDevice(ownerId);clearDevice();
  }
  return data;
 }catch(error){approved=false;throw error;}
}
export async function signedFetch(path,{token,method='GET',body}={}){
 if(!pair||!approved)throw Error('기기 승인을 먼저 확인해 주세요.');
 // Query parameters are not supported on protected notes routes.
 if(!/^\/api\/(?:notes(?:\/[a-f0-9-]{36})?|operations)$/u.test(path))throw Error('허용되지 않은 자료 경로입니다.');
 method=method.toUpperCase();
 const authorization='Bearer '+token,at=new Date().toISOString(),nonce=crypto.randomUUID();
 const message=signedMessage({deviceId,method,path,bodyHash:await digest(canonical(body)),tokenHash:await digest(authorization),at,nonce});
 const bytes=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,enc.encode(message)));
 const signature=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/u,'');
 return fetch(path,{method,cache:'no-store',headers:{Authorization:authorization,'Content-Type':'application/json',
  'X-Byteback-App-Device':deviceId,'X-Byteback-App-Time':at,'X-Byteback-App-Nonce':nonce,'X-Byteback-App-Signature':signature},
  body:body===undefined?undefined:JSON.stringify(body)});
}
