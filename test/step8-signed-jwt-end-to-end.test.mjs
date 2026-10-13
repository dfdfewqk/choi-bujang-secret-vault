// Stage 8: exercise the REAL ES256 judge-verification path with synthetic tokens.
// No live credentials, personal data, remote issuer, or customer notes.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPair,SignJWT} from 'jose';
import config from '../aleph.config.json' with {type:'json'};
import {createLoginVerifier} from '../src/verify-login.mjs';
import {handleNotes} from '../src/notes-api.mjs';

const RUN='11111111-1111-4111-8111-111111111111';
const OTHER_RUN='22222222-2222-4222-8222-222222222222';
const SUBJECT='33333333-3333-4333-8333-333333333333';
const PRIVATE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRIVATE_NOTE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECRET='TEST_ONLY_NOT_A_SUPABASE_SECRET_STAGE8_2026';
const appHost=new URL(config.publicAppUrl).hostname;
function testDb(){
 const rows=[{note_uuid:PRIVATE_NOTE,owner_id:PRIVATE,title:'Private account',
   content:'Synthetic data only'}];
 const events=[];
 return {rows,events,from(table){
   assert.equal(table,'vault_training_notes');
   let operation='read',writeData;
   const terms=new Map();
   const valid=row=>[...terms].every(([k,v])=>row[k]===v);
   const query={
     select(){return query;},
     eq(k,v){terms.set(k,v);return query;},
     order(){return query;},
     async limit(n){
       events.push({operation:'list',terms:Object.fromEntries(terms)});
       return {data:rows.filter(valid).slice(0,n).map(x=>({...x})),error:null};
     },
     async maybeSingle(){
       events.push({operation,terms:Object.fromEntries(terms)});
       const index=rows.findIndex(valid);
       if(index<0)return {data:null,error:null};
       if(operation==='update')Object.assign(rows[index],writeData);
       return {data:{...rows[index]},error:null};
     },
     async insert(data){
       events.push({operation:'insert',data:{...data}});
       rows.push({...data});return {error:null};
     },
     update(v){operation='update';writeData={...v};return query;},
     delete(){operation='delete';return query;},
     then(resolve,reject){
       events.push({operation,terms:Object.fromEntries(terms)});
       const removed=[];
       if(operation==='delete'){
         for(let i=rows.length-1;i>=0;i--)if(valid(rows[i])){
           removed.push({note_uuid:rows.splice(i,1)[0].note_uuid});
         }
       }
       return Promise.resolve({data:removed,error:null}).then(resolve,reject);
     },
   };return query;
 }};
}
function response(){
 const headers=new Map();
 return {statusCode:0,body:null,headers,
   setHeader(k,v){headers.set(k.toLowerCase(),v);return this;},
   status(n){this.statusCode=n;return this;},
   json(v){this.body=v;return this;}};
}
async function issue(privateKey,identity,{run=RUN,issuer=config.judgeIssuer,
 audience=appHost,role='judge',expiration='5m'}={}){
 return new SignJWT({aleph_role:role,aleph_identity:identity,aleph_run:run})
   .setProtectedHeader({alg:'ES256',typ:'JWT'})
   .setSubject(SUBJECT).setIssuer(issuer).setAudience(audience)
   .setIssuedAt().setExpirationTime(expiration).sign(privateKey);
}
async function invoke(db,verifier,token,{method='GET',id=null,body={},headers={}}={}){
 const res=response();
 const h={...headers};
 if(token!==null)h.authorization='Bearer '+token;
 await handleNotes({method,headers:h,body,query:id?{id}:undefined},
   res,{itemId:id,verifyAuthorization:verifier,databaseFactory:()=>db});
 return res;
}
test('S08 actual ES256 signature -> run owner -> A own / B denied, without real credentials',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('ES256');
 const {privateKey:forgeryKey}=await generateKeyPair('ES256');
 const verifier=createLoginVerifier({config,supabaseSecretKey:SECRET,
   judgeKeySet:async()=>publicKey,
   supabaseClient:{auth:{getClaims:async()=>({data:{claims:null},error:null})}}});
 const a=await issue(privateKey,'a'),b=await issue(privateKey,'b');
 const other=await issue(privateKey,'a',{run:OTHER_RUN});
 const forged=await issue(forgeryKey,'a');
 const wrongAudience=await issue(privateKey,'a',{audience:'other.vercel.app'});
 const wrongIssuer=await issue(privateKey,'a',{issuer:'https://other.example.org/defense/judge'});
 const wrongRole=await issue(privateKey,'a',{role:'instructor'});
 const wrongIdentity=await issue(privateKey,'admin');
 const db=testDb(),url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://fake.local.test';
 process.env.SUPABASE_SECRET_KEY=SECRET;
 try{
   const aPrincipal=await verifier('Bearer '+a);
   assert.equal(aPrincipal.kind,'judge');
   assert.equal(aPrincipal.identity,'a');
   const bPrincipal=await verifier('Bearer '+b);
   assert.equal(bPrincipal.identity,'b');
   for(const token of [forged,wrongAudience,wrongIssuer,wrongRole,wrongIdentity]){
     assert.equal(await verifier('Bearer '+token),null);
   }
   for(const token of [forged,wrongAudience,wrongIssuer,wrongRole,wrongIdentity,null]){
     const r=await invoke(db,verifier,token,{id:PRIVATE_NOTE});
     assert.equal(r.statusCode,401);
   }
   assert.equal((await invoke(db,verifier,a,{id:PRIVATE_NOTE})).statusCode,404);
   assert.equal((await invoke(db,verifier,b,{id:PRIVATE_NOTE})).statusCode,404);
   const created=await invoke(db,verifier,a,{method:'POST',
     body:{title:'Only A',body:'A-only fixture'}});
   assert.equal(created.statusCode,201);
   const id=created.body.id;
   assert.match(id,/^[a-f0-9-]{36}$/u);
   const own=await invoke(db,verifier,a,{id});
   assert.equal(own.statusCode,200);
   assert.equal(own.body.body,'A-only fixture');
   assert.equal(own.headers.get('cache-control'),'no-store');
   for(const attacker of [b,other]){
     const denied=await invoke(db,verifier,attacker,{id,
       headers:{'x-role':'instructor','x-owner-id':PRIVATE},
     });
     assert.equal(denied.statusCode,404);
     assert.deepEqual(denied.body,{error:'NOT_FOUND'});
     assert.equal((await invoke(db,verifier,attacker,{method:'PUT',id,
       body:{title:'tampered',body:'tampered',role:'instructor'}})).statusCode,404);
     assert.equal((await invoke(db,verifier,attacker,{method:'DELETE',id})).statusCode,404);
   }
   const ownList=await invoke(db,verifier,a);
   const bList=await invoke(db,verifier,b);
   assert.deepEqual(ownList.body.notes.map(x=>x.id),[id]);
   assert.deepEqual(bList.body.notes,[]);
   assert.equal((await invoke(db,verifier,a,{method:'POST',
     body:{id:PRIVATE_NOTE,title:'clone',body:'clone'}})).statusCode,400);
   assert.equal((await invoke(db,verifier,a,{method:'POST',
     body:{title:'spoof',body:'spoof',owner_id:PRIVATE}})).statusCode,400);
   assert.equal((await invoke(db,verifier,a,{id,method:'PUT',
     body:{title:'spoof',body:'spoof',owner_id:PRIVATE}})).statusCode,400);
   assert.equal((await invoke(db,verifier,a,{id})).statusCode,200);
   // Every object-level SELECT/UPDATE/DELETE includes the verified owner.
   for(const event of db.events.filter(x=>['read','update','delete'].includes(x.operation))){
     assert.equal(typeof event.terms.note_uuid,'string');
     assert.equal(typeof event.terms.owner_id,'string');
   }
   assert.equal(db.rows.find(x=>x.note_uuid===PRIVATE_NOTE).content,'Synthetic data only');
 }finally{
   if(url===undefined)delete process.env.SUPABASE_URL;
   else process.env.SUPABASE_URL=url;
   if(key===undefined)delete process.env.SUPABASE_SECRET_KEY;
   else process.env.SUPABASE_SECRET_KEY=key;
 }
});
