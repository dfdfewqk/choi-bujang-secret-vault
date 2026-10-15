import {canonical,signedMessage} from './request-signature.mjs';
const enc=new TextEncoder();
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
let pair=null,deviceId=null,approved=false;
export function clearDevice(){pair=null;deviceId=null;approved=false;}
export async function requestApproval(token){
 if(!pair)pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const resp=await fetch('/api/device',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({publicKey}),cache:'no-store'});
 const data=await resp.json();if(!resp.ok)throw Error(data.error??'DEVICE_REQUEST_FAILED');
 deviceId=data.deviceId;approved=data.status==='approved';return data;
}
export async function approvalStatus(token){
 if(!deviceId)return {status:'unknown'};
 const resp=await fetch('/api/device?id='+deviceId,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
 const data=await resp.json();if(!resp.ok){approved=false;throw Error(data.error??'DEVICE_STATUS_FAILED');}
 approved=data.status==='approved';return data;
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
