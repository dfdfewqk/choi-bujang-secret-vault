import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { handleAuth } from '../src/auth-api.mjs';

function res() {
  let code, payload;
  const headers = new Map();
  return {
    headers, get code(){return code;},get payload(){return payload;},
    setHeader(k,v){headers.set(k.toLowerCase(),v);return this;},
    status(n){code=n;return this;},
    json(o){payload=o;return this;},
  };
}
function mockAuth(overrides={}) {
  const calls=[];
  const user={ id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email:'demo@example.invalid',email_confirmed_at:'2026-10-12T00:00:00Z' };
  const session={access_token:'synthetic.jwt.access',refresh_token:'test-refresh-token',
    expires_at:2000000000,user};
  const auth={
    signInWithPassword:async input=>{calls.push({method:'login',email:input.email});return {data:{session},error:null};},
    signUp:async input=>{calls.push({method:'signup',redirect:input.options.emailRedirectTo});
      return {data:{session:null,user},error:null};},
    refreshSession:async input=>{calls.push({method:'refresh',refresh:input.refresh_token});
      return {data:{session},error:null};},
    getUser:async access=>{calls.push({method:'session',access});return {data:{user},error:null};},
    setSession:async input=>{calls.push({method:'setSession',access:input.access_token});
      return {data:{session},error:null};},
    signOut:async input=>{calls.push({method:'signOut',scope:input.scope});return {error:null};},
    ...overrides,
  };
  return {auth,calls,session,user};
}
async function invoke(action, body, {factory=mockAuth(), method='POST',
  origin='https://choi-bujang-secret-vault-six-jet.vercel.app'}={}) {
  const output=res();
  await handleAuth({method,body:{action,...body},headers:{
    origin,host:'choi-bujang-secret-vault-six-jet.vercel.app',
  }},output,{createAuthClient:()=>factory});
  return output;
}

test('static pages load only same-origin Auth and contain no browser SDK key',async()=>{
  for(const p of ['public/index.html','public/signup.html','public/access-check.html',
    'public/auth-client.mjs','public/auth-feedback.mjs']) {
    const src=await readFile(new URL('../'+p,import.meta.url),'utf8');
    assert.doesNotMatch(src,/sb_publishable_[A-Za-z0-9_-]+/u,p);
    assert.doesNotMatch(src,/sb_secret_[A-Za-z0-9_-]+/u,p);
    assert.doesNotMatch(src,/https:\/\/[^\s'"<>]*supabase\.co/iu,p);
    assert.doesNotMatch(src,/\/rest\/v1\/vault_training_notes/iu,p);
    assert.doesNotMatch(src,/esm\.sh\/@supabase/u,p);
  }
  for(const p of ['public/index.html','public/signup.html','public/access-check.html']) {
    const page=await readFile(new URL('../'+p,import.meta.url),'utf8');
    assert.match(page,/createServerAuthClient\(\)/u);
  }
  const authCode=await readFile(new URL('../public/auth-client.mjs',import.meta.url),'utf8');
  for(const op of ['login','signup','refresh','session','logout'])assert.ok(authCode.includes(op));
  assert.match(authCode,/fetch\('\/api\/auth'/u);
  const backend=await readFile(new URL('../src/auth-api.mjs',import.meta.url),'utf8');
  assert.match(backend,/SERVER_AUTH_PUBLIC_KEY/u);
  assert.doesNotMatch(backend,/SUPABASE_SECRET_KEY/u);
  const noteApi=await readFile(new URL('../src/notes-api.mjs',import.meta.url),'utf8');
  assert.match(noteApi,/\.eq\('owner_id', verified\.userId\)/u);
});

test('login, signup and refresh return only an Auth session, not server keys',async()=>{
  const factory=mockAuth();
  const login=await invoke('login',{email:'demo@example.invalid',password:'sample-password'}, {factory});
  assert.equal(login.code,200);
  assert.deepEqual(login.payload.session,factory.session);
  assert.equal(JSON.stringify(login.payload).includes('SUPABASE_SECRET'),false);
  assert.equal(login.headers.get('cache-control'),'no-store, private');
  assert.equal(login.headers.get('x-content-type-options'),'nosniff');
  const signup=await invoke('signup',{email:'new@example.invalid',password:'sample-password'}, {factory});
  assert.equal(signup.code,200);
  assert.deepEqual(signup.payload,{accepted:true,session:null});
  assert.equal(factory.calls.find(x=>x.method==='signup').redirect,
    'https://choi-bujang-secret-vault-six-jet.vercel.app/');
  const refreshed=await invoke('refresh',{refresh_token:'test-refresh-token'}, {factory});
  assert.equal(refreshed.code,200);
  assert.deepEqual(refreshed.payload.session,factory.session);
});

test('existing token verification and global logout are server-side',async()=>{
  const factory=mockAuth();
  const session=await invoke('session',{access_token:'synthetic.jwt.access'},{factory});
  assert.equal(session.code,200);
  assert.deepEqual(session.payload.user,factory.user);
  const logout=await invoke('logout',{access_token:'synthetic.jwt.access',
    refresh_token:'test-refresh-token'},{factory});
  assert.equal(logout.code,200);
  assert.deepEqual(logout.payload,{signedOut:true});
  assert.deepEqual(factory.calls.filter(x=>x.method==='signOut').map(x=>x.scope),['global']);
});

test('invalid, cross-origin and anonymous Auth requests do not touch backend',async()=>{
  let accesses=0;
  const factory=()=>{accesses++;throw Error('should never be called');};
  const bad=[
    ['login',{email:'invalid',password:'sample-password'}],
    ['refresh',{}],['session',{}],['logout',{}],['invalid',{}],
    ['signup',{email:'demo@example.invalid',password:'short'}],
  ];
  for(const [action,body] of bad){
    const output=await invoke(action,body,{factory});
    assert.ok([400,401].includes(output.code));
  }
  const wrongOrigin=await invoke('login',{email:'demo@example.invalid',password:'sample-password'},
    {factory,origin:'https://untrusted.invalid'});
  assert.equal(wrongOrigin.code,403);
  assert.equal(accesses,0);
});

test('login failure is returned without leaking password or issuing session',async()=>{
  const auth=mockAuth({signInWithPassword:async()=>({
    data:{session:null},error:{status:400,code:'invalid_credentials',message:'Invalid login credentials'},
  })});
  const result=await invoke('login',{email:'demo@example.invalid',password:'sample-password'},{factory:auth});
  assert.equal(result.code,400);
  assert.equal(result.payload.error,'invalid_credentials');
  assert.doesNotMatch(JSON.stringify(result.payload),/sample-password|access_token/u);
});

test('same-origin browser facade handles login, token retrieval and logout',async()=>{
  const previous={window:globalThis.window,location:globalThis.location,
    history:globalThis.history,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
  const backing=new Map();
  const calls=[];
  const session={access_token:'synthetic.jwt.access',refresh_token:'test-refresh-token',
    expires_at:2000000000,user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email:'demo@example.invalid',email_confirmed_at:'2026-10-12'}};
  try{
    globalThis.window={location:{hash:''},setInterval:()=>1,addEventListener:()=>{}};
    globalThis.location={hash:'',pathname:'/',search:''};
    globalThis.history={state:null,replaceState:()=>{}};
    globalThis.localStorage={
      getItem:key=>backing.get(key)??null,
      setItem:(key,value)=>backing.set(key,value),
      removeItem:key=>backing.delete(key),
    };
    globalThis.fetch=async (path,options)=>{
      assert.equal(path,'/api/auth');
      const payload=JSON.parse(options.body);
      calls.push(payload.action);
      const body=payload.action==='login'||payload.action==='refresh'?{session}
        :payload.action==='session'?{user:session.user}
        :{signedOut:true};
      return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
    };
    const {createServerAuthClient}=await import('../public/auth-client.mjs?isolated=stage5-auth');
    const client=createServerAuthClient();
    const events=[];
    const subscription=client.auth.onAuthStateChange((event)=>events.push(event));
    const signedIn=await client.auth.signInWithPassword({
      email:'demo@example.invalid',password:'sample-password'});
    assert.equal(signedIn.error,null);
    assert.equal(signedIn.data.session.access_token,session.access_token);
    assert.equal((await client.auth.getSession()).data.session.user.email,session.user.email);
    assert.ok(backing.has('byteback-server-auth-v1'));
    assert.ok(events.includes('SIGNED_IN'));
    assert.equal((await client.auth.signOut()).error,null);
    assert.equal((await client.auth.getSession()).data.session,null);
    assert.ok(events.includes('SIGNED_OUT'));
    subscription.data.subscription.unsubscribe();
    assert.deepEqual(calls,['login','logout']);
  }finally{
    for(const [key,value] of Object.entries(previous)){
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
});
