// Stage 8 browser session regression: synthetic accounts only, no real secrets.
import assert from 'node:assert/strict';
import { test } from 'node:test';

function storage(initial) {
  const map=new Map(initial ?? []);
  return {map,getItem:k=>map.get(k)??null,
    setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
const mkSession=(name)=>({
  access_token:'synthetic-'+name+'-jwt',
  refresh_token:'synthetic-'+name+'-refresh',
  expires_at:2000000000,
  user:{id: name==='A'?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    :'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email:name.toLowerCase()+'@example.invalid',
    email_confirmed_at:'2026-10-13T00:00:00Z'},
});

test('two tabs keep distinct accounts, reuse same-tab session on navigation, and log out independently',async()=>{
  const previous={window:globalThis.window,location:globalThis.location,
    history:globalThis.history,localStorage:globalThis.localStorage,
    sessionStorage:globalThis.sessionStorage,fetch:globalThis.fetch};
  const shared=storage([['byteback-server-auth-v1',JSON.stringify(mkSession('A'))]]);
  const tabA=storage(),tabB=storage();
  const events=[],calls=[];
  try {
    globalThis.window={location:{hash:''},setInterval:()=>0,
      addEventListener:(event)=>events.push(event)};
    globalThis.location={hash:'',pathname:'/',search:''};
    globalThis.history={state:null,replaceState(){}};
    globalThis.localStorage=shared;
    const selectTab=(store)=>{globalThis.sessionStorage=store;};
    globalThis.fetch=async(path,options)=>{
      assert.equal(path,'/api/auth');
      const request=JSON.parse(options.body);
      calls.push(request.action);
      const name=request.action==='login'
        ?request.email.slice(0,1).toUpperCase()
        :request.access_token?.includes('-B-')?'B':'A';
      const body=request.action==='login'?{session:mkSession(name)}
        :request.action==='session'?{user:mkSession(name).user}
        :{signedOut:true};
      return new Response(JSON.stringify(body),{status:200,
        headers:{'Content-Type':'application/json'}});
    };
    selectTab(tabA);
    const {createServerAuthClient:makeA}=await import('../public/auth-client.mjs?isolated=tab-a');
    const a=makeA();
    // Existing login is migrated once to A's private tab, then removed globally.
    assert.equal((await a.auth.getSession()).data.session.user.email,'a@example.invalid');
    assert.ok(tabA.map.has('byteback-server-auth-v1'));
    assert.equal(shared.map.has('byteback-server-auth-v1'),false);
    assert.equal(shared.map.has('sb-bcwzllejypavwgsfqfbm-auth-token'),false);

    selectTab(tabB);
    const {createServerAuthClient:makeB}=await import('../public/auth-client.mjs?isolated=tab-b');
    const b=makeB();
    assert.equal((await b.auth.getSession()).data.session,null);
    await b.auth.signInWithPassword({email:'b@example.invalid',password:'synthetic-password'});
    assert.equal((await b.auth.getSession()).data.session.user.email,'b@example.invalid');

    selectTab(tabA);
    assert.equal((await a.auth.getSession()).data.session.user.email,'a@example.invalid');
    const {createServerAuthClient:makeANav}=await import('../public/auth-client.mjs?isolated=tab-a-navigation');
    assert.equal((await makeANav().auth.getSession()).data.session.user.email,'a@example.invalid');

    // Logging out of A does not clear B's session in another tab.
    await a.auth.signOut();
    assert.equal(tabA.map.has('byteback-server-auth-v1'),false);
    selectTab(tabB);
    assert.equal((await b.auth.getSession()).data.session.user.email,'b@example.invalid');
    assert.equal(tabB.map.has('byteback-server-auth-v1'),true);
    assert.equal(events.includes('storage'),false,
      'Cross-tab storage broadcasting would overwrite the other account');
    assert.ok(calls.includes('logout'));
  } finally {
    for(const [key,value] of Object.entries(previous)){
      if(value===undefined) delete globalThis[key];
      else globalThis[key]=value;
    }
  }
});

test('existing shared Supabase SDK session is migrated to one tab and not exposed to others',async()=>{
  const previous={window:globalThis.window,location:globalThis.location,
    history:globalThis.history,localStorage:globalThis.localStorage,
    sessionStorage:globalThis.sessionStorage,fetch:globalThis.fetch};
  const shared=storage([['sb-bcwzllejypavwgsfqfbm-auth-token',JSON.stringify(mkSession('A'))]]);
  const tabA=storage(),tabB=storage();
  try {
    globalThis.window={location:{hash:''},setInterval:()=>0,addEventListener(){}};
    globalThis.location={hash:'',pathname:'/',search:''};
    globalThis.history={state:null,replaceState(){}};
    globalThis.localStorage=shared;
    globalThis.sessionStorage=tabA;
    globalThis.fetch=async(_path,options)=>{
      const {action}=JSON.parse(options.body);
      return new Response(JSON.stringify(action==='session'?{user:mkSession('A').user}:{signedOut:true}),{status:200});
    };
    const {createServerAuthClient:makeA}=await import('../public/auth-client.mjs?isolated=legacy-a');
    assert.equal((await makeA().auth.getSession()).data.session.user.email,'a@example.invalid');
    assert.equal(shared.map.size,0);
    globalThis.sessionStorage=tabB;
    const {createServerAuthClient:makeB}=await import('../public/auth-client.mjs?isolated=legacy-b');
    assert.equal((await makeB().auth.getSession()).data.session,null);
  } finally {
    for(const [key,value] of Object.entries(previous)){
      if(value===undefined) delete globalThis[key];
      else globalThis[key]=value;
    }
  }
});
