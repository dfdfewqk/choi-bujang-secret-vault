import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleNotes } from '../src/notes-api.mjs';
import { createLoginVerifier } from '../src/verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function response() {
  let statusCode, body;
  const headers = new Map();
  return { get statusCode(){return statusCode;},get body(){return body;},headers,
    setHeader(n,v){headers.set(n.toLowerCase(),v);return this;},
    status(n){statusCode=n;return this;},
    json(o){body=o;return this;} };
}
function database(rows) {
  const log = [];
  function query() {
    let operation='read',filterId=null,ownerFilter=null,input=null;
    const q={
      select(){return q;}, eq(k,v){if(k==='note_uuid')filterId=v;if(k==='owner_id')ownerFilter=v;return q;},
      or(s){ownerFilter=s;return q;},order(){return q;},
      limit:async()=>({
        data:rows.filter(r=>r.owner_id===ownerFilter)
          .map(r=>({...r})),error:null,
      }),
      maybeSingle:async()=>{
        const index=rows.findIndex(r=>r.note_uuid===filterId && r.owner_id===ownerFilter);
        if(index<0)return {data:null,error:null};
        const row=rows[index];
        if(operation==='update')Object.assign(row,input);
        return {data:{...row},error:null};
      },
      insert:async(row)=>{log.push(['insert',row]);rows.push({...row});return {error:null};},
      update:payload=>{operation='update';input=payload;return q;},
      delete:()=>{operation='delete';return q;},
      then(resolve,reject){
        let output={data:[],error:null};
        if(operation==='delete') {
          const idx=rows.findIndex(r=>r.note_uuid===filterId && r.owner_id===ownerFilter);
          if(idx>=0){output={data:[{note_uuid:rows[idx].note_uuid}],error:null};rows.splice(idx,1);}
        }
        return Promise.resolve(output).then(resolve,reject);
      },
    };
    return q;
  }
  return {db:{from:name=>{assert.equal(name,'vault_training_notes');return query();}},rows,log};
}
async function exercise({method='GET',id=null,body=null,user=A,auth='Bearer fake.jwt.payload',db}) {
  const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
  process.env.SUPABASE_URL='https://stub.supabase.co';
  process.env.SUPABASE_SECRET_KEY='TEST_ONLY_NOT_REAL';
  const res=response();
  try {
    await handleNotes({method,body,headers:{authorization:auth}},res,{
      itemId:id,appVerification:async()=>({ok:true}),verifyAuthorization:async()=>user?{kind:'student',userId:user}:null,
      databaseFactory:()=>db,
    });
  }finally{
    if(previous.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previous.url;
    if(previous.key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=previous.key;
  }
  return res;
}

test('missing and invalid login rejected as JSON',async()=>{
  const {db}=database([]);
  for(const auth of [null,'Bearer a.b.c']){
    const res=await exercise({auth,user:auth?null:A,db});
    assert.equal(res.statusCode,401);
    assert.deepEqual(res.body,{error:'UNAUTHORIZED'});
    assert.equal(res.headers.get('content-type'),'application/json; charset=utf-8');
  }
});

test('personal list excludes other users and unassigned notes',async()=>{
  const {db}=database([
    {note_uuid:ID,owner_id:A,title:'A',content:'A note'},
    {note_uuid:OTHER_ID,owner_id:B,title:'B',content:'B note'},
    {note_uuid:'33333333-3333-4333-8333-333333333333',owner_id:null,title:'demo',content:'shared'},
  ]);
  const res=await exercise({db});
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.notes.map(x=>x.title),['A']);
});

test('create, fetch, edit, delete and 404 after deletion with validated server owner',async()=>{
  const store=database([]);
  const created=await exercise({method:'POST',body:{title:'First',body:'sample'},db:store.db});
  assert.equal(created.statusCode,201);
  assert.match(created.body.id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
  const actualId=created.body.id;
  assert.equal(store.rows[0].owner_id,A);
  assert.equal(store.rows[0].sort_order,undefined);
  const found=await exercise({id:actualId,db:store.db});
  assert.equal(found.statusCode,200);
  assert.deepEqual(found.body,{id:actualId,title:'First',body:'sample'});
  const edited=await exercise({method:'PUT',id:actualId,body:{title:'Second',body:'changed'},db:store.db});
  assert.equal(edited.statusCode,200);
  assert.equal(edited.body.body,'changed');
  // Stage 4 prevents verified B from reading A's private note by ID.
  const fromB=await exercise({id:actualId,user:B,db:store.db});
  assert.equal(fromB.statusCode,404);
  const gone=await exercise({method:'DELETE',id:actualId,db:store.db});
  assert.equal(gone.statusCode,200);
  const missing=await exercise({id:actualId,db:store.db});
  assert.equal(missing.statusCode,404);
  assert.deepEqual(missing.body,{error:'NOT_FOUND'});
});

test('reject malformed UUID and invalid request body',async()=>{
  const {db}=database([]);
  const malformed=await exercise({id:'not-uuid',db});
  assert.equal(malformed.statusCode,400);
  const missing=await exercise({method:'POST',body:{title:'',body:'x'},db});
  assert.equal(missing.statusCode,400);
});

test('existing verify-login contract rejects malformed token and verifies issuer/audience',async()=>{
  const now=Math.floor(Date.now()/1000);
  const valid={iss:config.identityProvider.issuer,aud:'authenticated',sub:A,role:'authenticated',exp:now+3600};
  const payload=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
  const token=claims=>payload({alg:'HS256',typ:'JWT'})+'.'+payload(claims)+'.signature';
  const verifier=createLoginVerifier({config,
    judgeKeySet:()=>{throw new Error('No judge key fetch in unit test');},
    supabaseClient:{auth:{getClaims:async t=>({data:{claims: t===token(valid)?valid:null},error:null})}},
  });
  assert.equal(await verifier(undefined),null);
  assert.equal(await verifier('Bearer invalid'),null);
  assert.equal((await verifier('Bearer '+token(valid)))?.userId,A);
  for(const bad of [{...valid,aud:'different'}, {...valid,iss:'https://other.example.com/auth/v1'},
    {...valid,exp:now-10}])assert.equal(await verifier('Bearer '+token(bad)),null);
});

test('stage 5 keeps Vercel routing and notes while server-proxying Auth', async()=>{
  const { readFile }=await import('node:fs/promises');
  const vercel=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(vercel.rewrites,[{source:'/api/notes/:id',destination:'/api/note?id=:id'}]);
  assert.ok(vercel.headers.some(r=>r.headers?.some(h=>h.key==='X-Content-Type-Options' && h.value==='nosniff')));
  const page=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(page,/signInWithPassword/u);
  assert.match(page,/signOut/u);
  assert.match(page,/href="\/signup\.html"/u);
  const registrationPage=await readFile(new URL('../public/signup.html',import.meta.url),'utf8');
  assert.match(registrationPage,/supabase\.auth\.signUp/u);
  assert.doesNotMatch(page,/sb_publishable_/u);
  assert.doesNotMatch(registrationPage,/sb_publishable_/u);
  assert.match(page,/createServerAuthClient/u);
  assert.doesNotMatch(page,/sb_secret_[A-Za-z0-9_-]{12,}/u);
  assert.doesNotMatch(page,/실습용 가상 과제 기록/u);
  assert.ok(config.step >= 4);
  assert.deepEqual(config.allowedRoutes,[
    'GET /api/notes','POST /api/notes','GET /api/notes/:id',
    'PUT /api/notes/:id','DELETE /api/notes/:id',
  ]);
});


test('monster defense theme keeps the real login form and responsive stylesheet',async()=>{
  const {readFile}=await import('node:fs/promises');
  const page=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const css=await readFile(new URL('../public/monster-defense.css',import.meta.url),'utf8');
  assert.match(page,/MONSTER\s*<br>DATA DEFENSE/u);
  assert.match(page,/href="\/monster-defense\.css"/u);
  assert.match(page,/id="login-form"/u);
  assert.match(page,/id="email"/u);
  assert.match(page,/id="password"/u);
  assert.match(page,/id="signup"/u);
  assert.match(page,/id="logout"/u);
  assert.match(page,/id="vault-panel"/u);
  assert.match(page,/id="notes"/u);
  assert.match(page,/id="create-form"/u);
  assert.match(page,/signInWithPassword/u);
  assert.match(page,/signOut/u);
  assert.match(page,/href="\/signup\.html"/u);
  const registrationPage=await readFile(new URL('../public/signup.html',import.meta.url),'utf8');
  assert.match(registrationPage,/supabase\.auth\.signUp/u);
  for(const layer of ['scene-city.svg','scene-monsters.svg','scene-shield.svg']) {
    assert.ok(page.includes('/assets/'+layer), 'missing visual layer '+layer);
  }
  assert.doesNotMatch(page,/(?:SECURE|DATA SAFE|class="scene-label"|class="holo ")/u);
  assert.doesNotMatch(page, /hud-check/u, 'No checkmark may overlay the monster eye');
  const build=await readFile(new URL('../scripts/build-public.mjs',import.meta.url),'utf8');
  for(const layer of ['scene-city.svg','scene-monsters.svg','scene-shield.svg']) assert.ok(build.includes(layer));
  assert.match(css,/@keyframes monsterBreathe/u);
  assert.match(css,/@keyframes shieldEnergy/u);
  assert.match(css,/@keyframes cityDrift/u);
  assert.doesNotMatch(page,/monsters\/whale\.webp/u);
  assert.doesNotMatch(page,/class="nav-links"/u);
  assert.doesNotMatch(page,/class="defense-footer"/u);
  const image=await readFile(new URL('../assets/monster-shield-scene.avif',import.meta.url));
  const {createHash}=await import('node:crypto');
  assert.equal(image.length,58013);
  assert.equal(createHash('sha256').update(image).digest('hex'),'3f1f02c12f6cca2e29d1c94e3e2ecb4dd7aae370bb5d6d0e319ae05c39c0135c');
  assert.match(css,/@media\(max-width:780px\)/u);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/u);
});
