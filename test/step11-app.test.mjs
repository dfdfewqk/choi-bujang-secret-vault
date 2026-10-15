import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {canonical,signedMessage} from '../public/request-signature.mjs';
import {hash,publicDeviceKey,verifyAppRequest} from '../src/app-request.mjs';
import {handleDevice} from '../src/device-api.mjs';
import {handleNotes} from '../src/notes-api.mjs';
const OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture(){
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const {key,deviceId}=publicDeviceKey(publicKey.export({format:'jwk'}));
 const seen=new Set();let state='approved';
 const db={rpc:async(name,args)=>{
  if(args.p_owner!==OWNER)return {data:{status:'unknown'}};
  if(name==='byteback_device_status')return {data:{status:state,publicKey:key,deviceId}};
  if(name==='byteback_register_app_device'){state='pending';return {data:{status:state,deviceId}};}
  if(name==='byteback_consume_app_nonce'){
   const fresh=state==='approved'&&!seen.has(args.p_nonce);if(fresh)seen.add(args.p_nonce);return {data:fresh};
  }
  throw Error('Unexpected RPC');
 }};
 const request=(path='/api/notes',method='GET',body)=>{
  const at=new Date().toISOString(),nonce=randomUUID(),authorization='Bearer synthetic-token';
  const message=signedMessage({deviceId,method,path,bodyHash:hash(canonical(body)),tokenHash:hash(authorization),at,nonce});
  return {method,body,headers:{authorization,'x-byteback-app-device':deviceId,'x-byteback-app-time':at,
   'x-byteback-app-nonce':nonce,'x-byteback-app-signature':sign('sha256',Buffer.from(message),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}};
 };
 return {db,request,key,deviceId,setState:s=>{state=s;}};
}
function res(){return {code:0,body:null,setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};}
test('unsigned, pending, revoked and foreign owners cannot read protected notes',async()=>{
 const f=fixture();
 assert.equal((await verifyAppRequest({request:{method:'GET',headers:{}},owner:OWNER,db:f.db,path:'/api/notes'})).ok,false);
 for(const state of ['pending','revoked','expired']){
  f.setState(state);assert.equal((await verifyAppRequest({request:f.request(),owner:OWNER,db:f.db,path:'/api/notes'})).ok,false);
 }
 f.setState('approved');assert.equal((await verifyAppRequest({request:f.request(),owner:OTHER,db:f.db,path:'/api/notes'})).ok,false);
});
test('approved original succeeds; modified path, body, token and replay fail',async()=>{
 const f=fixture();const body={title:'Safe',body:'Synthetic text'};
 const altered=f.request('/api/notes/'+OWNER,'PUT',body);
 assert.equal((await verifyAppRequest({request:altered,owner:OWNER,db:f.db,path:'/api/notes/'+OTHER})).ok,false);
 altered.body={...body,body:'Changed'};
 assert.equal((await verifyAppRequest({request:altered,owner:OWNER,db:f.db,path:'/api/notes/'+OWNER})).ok,false);
 const original=f.request();
 assert.equal((await verifyAppRequest({request:original,owner:OWNER,db:f.db,path:'/api/notes'})).ok,true);
 assert.equal((await verifyAppRequest({request:original,owner:OWNER,db:f.db,path:'/api/notes'})).ok,false);
 const tokenChanged=f.request();tokenChanged.headers.authorization='Bearer another-token';
 assert.equal((await verifyAppRequest({request:tokenChanged,owner:OWNER,db:f.db,path:'/api/notes'})).ok,false);
});
test('browser WebCrypto signatures interoperate with server and private key cannot be exported',async()=>{
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 await assert.rejects(()=>webcrypto.subtle.exportKey('jwk',pair.privateKey));
 const {key,deviceId}=publicDeviceKey(await webcrypto.subtle.exportKey('jwk',pair.publicKey));
 const at=new Date().toISOString(),nonce=randomUUID(),authorization='Bearer browser-synthetic';
 const message=signedMessage({deviceId,method:'GET',path:'/api/notes',bodyHash:hash(''),tokenHash:hash(authorization),at,nonce});
 const signature=Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,Buffer.from(message))).toString('base64url');
 const db={rpc:async name=>({data:name==='byteback_device_status'?{status:'approved',publicKey:key}:true})};
 assert.equal((await verifyAppRequest({request:{method:'GET',headers:{authorization,'x-byteback-app-device':deviceId,
  'x-byteback-app-time':at,'x-byteback-app-nonce':nonce,'x-byteback-app-signature':signature}},owner:OWNER,db,path:'/api/notes'})).ok,true);
});
test('API guard rejects missing proof before note database access',async()=>{
 const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
 process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SECRET_KEY='synthetic-server-test-value';
 try{
  const f=fixture();f.db.from=()=>{throw Error('notes must not be touched');};const r=res();
  await handleNotes({method:'GET',headers:{authorization:'Bearer synthetic'}},r,
   {verifyAuthorization:async()=>({kind:'student',userId:OWNER}),databaseFactory:()=>f.db});
  assert.equal(r.code,403);assert.equal(r.body.error,'APP_SIGNATURE_REQUIRED');
 }finally{for(const [k,v] of [['SUPABASE_URL',previous.url],['SUPABASE_SECRET_KEY',previous.key]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('student enrollment is pending and forged approval/private keys rejected',async()=>{
 const f=fixture();const r=res();
 await handleDevice({method:'POST',body:{publicKey:f.key},headers:{authorization:'Bearer synthetic'}},r,
  {verifyAuthorization:async()=>({kind:'student',userId:OWNER}),databaseFactory:()=>f.db});
 assert.equal(r.code,200);assert.equal(r.body.status,'pending');
 const fake=res();await handleDevice({method:'POST',body:{publicKey:f.key,approved:true},headers:{authorization:'Bearer synthetic'}},fake,
  {verifyAuthorization:async()=>({kind:'student',userId:OWNER}),databaseFactory:()=>f.db});
 assert.equal(fake.code,400);assert.throws(()=>publicDeviceKey({...f.key,d:'private'}));
});
test('manifest is scoped; offline worker never caches note or auth responses',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');
 const worker=await readFile(new URL('../public/service-worker.js',import.meta.url),'utf8');
 assert.doesNotMatch(worker,/cache\.put|caches\.match\(event\.request/u);
 assert.match(worker,/cache\.add\('\/offline.html'\)/u);
 const auth=await readFile(new URL('../public/auth-client.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(auth,/setItem\(/u);
});
test('client enrollment/status/signing reaches guarded note API only after server approval',async()=>{
 const previous={fetch:globalThis.fetch,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
 process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SECRET_KEY='client-api-synthetic-server';
 let registered,approved=false,noteReads=0;const seen=new Set();
 const db={rpc:async(name,p)=>{
  if(name==='byteback_register_app_device'){registered={publicKey:p.p_key,deviceId:p.p_device};return {data:{...registered,status:'pending'}};}
  if(name==='byteback_device_status')return {data:{...registered,status:approved?'approved':'pending'}};
  if(name==='byteback_consume_app_nonce'){const ok=approved&&!seen.has(p.p_nonce);if(ok)seen.add(p.p_nonce);return {data:ok};}
  throw Error('unknown RPC');
 },from:()=>({select(){return this;},eq(){return this;},order(){return this;},limit:async()=>{noteReads++;return {data:[{note_uuid:OTHER,title:'Synthetic',content:'Safe'}]};}})};
 try{
  globalThis.fetch=async(url,options)=>{
   const u=new URL(url,'https://fixture.invalid');const response=res();
   const request={method:options.method??'GET',headers:Object.fromEntries(new Headers(options.headers)),query:Object.fromEntries(u.searchParams),body:options.body===undefined?undefined:JSON.parse(options.body)};
   const deps={verifyAuthorization:async()=>({kind:'student',userId:OWNER}),databaseFactory:()=>db};
   if(u.pathname==='/api/device')await handleDevice(request,response,deps);
   else await handleNotes(request,response,deps);
   return new Response(JSON.stringify(response.body),{status:response.code});
  };
  const client=await import('../public/device-client.mjs?stage11=integration');
  await assert.rejects(()=>client.signedFetch('/api/notes',{token:'synthetic-client'}));
  assert.equal((await client.requestApproval('synthetic-client')).status,'pending');
  assert.equal(noteReads,0);await assert.rejects(()=>client.signedFetch('/api/notes',{token:'synthetic-client'}));
  approved=true;assert.equal((await client.approvalStatus('synthetic-client')).status,'approved');
  const response=await client.signedFetch('/api/notes',{token:'synthetic-client'});
  assert.equal(response.status,200);assert.equal((await response.json()).notes[0].title,'Synthetic');assert.equal(noteReads,1);
  approved=false;const denied=await client.signedFetch('/api/notes',{token:'synthetic-client'});
  assert.equal(denied.status,403);assert.equal(noteReads,1);client.clearDevice();
 }finally{
  globalThis.fetch=previous.fetch;
  for(const [k,v] of [['SUPABASE_URL',previous.url],['SUPABASE_SECRET_KEY',previous.key]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }
});
