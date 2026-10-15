import assert from 'node:assert/strict';
import {test} from 'node:test';
const session=name=>({access_token:'synthetic-'+name,refresh_token:'synthetic-refresh-'+name,
 expires_at:2000000000,user:{id:name,email:name+'@example.invalid'}});
test('tokens remain page-local, legacy storage is discarded, reload needs login',async()=>{
 const prev={window:globalThis.window,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,fetch:globalThis.fetch};
 const legacy=new Map([['byteback-server-auth-v1',JSON.stringify(session('A'))]]);
 const tab=new Map([['byteback-server-auth-v1',JSON.stringify(session('B'))]]);
 const storage=map=>({getItem:k=>map.get(k),removeItem:k=>map.delete(k),setItem(){throw Error('token storage forbidden');}});
 try{
  globalThis.window={location:{hash:''},setInterval:()=>0};
  globalThis.localStorage=storage(legacy);globalThis.sessionStorage=storage(tab);
  globalThis.fetch=async(_url,options)=>{
   const p=JSON.parse(options.body);
   return new Response(JSON.stringify(p.action==='login'?{session:session(p.email)}:{signedOut:true}),{status:200});
  };
  const {createServerAuthClient:makeA}=await import('../public/auth-client.mjs?stage11=tabA');
  const a=makeA();assert.equal((await a.auth.getSession()).data.session,null);
  assert.equal(legacy.size,0);assert.equal(tab.size,0);
  await a.auth.signInWithPassword({email:'A',password:'synthetic'});
  const {createServerAuthClient:makeB}=await import('../public/auth-client.mjs?stage11=tabB');
  const b=makeB();assert.equal((await b.auth.getSession()).data.session,null);
  await b.auth.signInWithPassword({email:'B',password:'synthetic'});
  assert.equal((await a.auth.getSession()).data.session.user.id,'A');
  assert.equal((await b.auth.getSession()).data.session.user.id,'B');
  assert.equal((await makeA().auth.getSession()).data.session.user.id,'A');
  const {createServerAuthClient:reload}=await import('../public/auth-client.mjs?stage11=reload');
  assert.equal((await reload().auth.getSession()).data.session,null);
  await a.auth.signOut();assert.equal((await b.auth.getSession()).data.session.user.id,'B');
 }finally{for(const [k,v] of Object.entries(prev)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
