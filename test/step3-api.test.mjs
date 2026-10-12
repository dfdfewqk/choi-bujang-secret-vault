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
      select(){return q;}, eq(k,v){if(k==='note_uuid')filterId=v;return q;},
      or(s){ownerFilter=s;return q;},order(){return q;},
      limit:async()=>({
        data:rows.filter(r=>ownerFilter?.includes(r.owner_id??'is.null')&&
          (r.owner_id===null||ownerFilter.includes(r.owner_id)))
          .map(r=>({...r})),error:null,
      }),
      maybeSingle:async()=>{
        const index=rows.findIndex(r=>r.note_uuid===filterId);
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
          const idx=rows.findIndex(r=>r.note_uuid===filterId);
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
      itemId:id,verifyAuthorization:async()=>user?{kind:'student',userId:user}:null,
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
  for(const auth of [undefined,'Bearer a.b.c']){
    const res=await exercise({auth,user:auth?null:A,db});
    assert.equal(res.statusCode,401);
    assert.deepEqual(res.body,{error:'UNAUTHORIZED'});
    assert.equal(res.headers.get('content-type'),'application/json; charset=utf-8');
  }
});

test('personal list and legacy unassigned synthetic notes require login',async()=>{
  const {db}=database([
    {note_uuid:ID,owner_id:A,title:'A',content:'A note'},
    {note_uuid:OTHER_ID,owner_id:B,title:'B',content:'B note'},
    {note_uuid:'33333333-3333-4333-8333-333333333333',owner_id:null,title:'demo',content:'shared'},
  ]);
  const res=await exercise({db});
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.notes.map(x=>x.title),['A','demo']);
});

test('create, fetch, edit, delete and 404 after deletion with validated server owner',async()=>{
  const store=database([]);
  const created=await exercise({method:'POST',body:{id:ID,title:'First',body:'sample',owner_id:B},db:store.db});
  assert.equal(created.statusCode,201);
  assert.deepEqual(created.body,{id:ID});
  assert.equal(store.rows[0].owner_id,A);
  assert.equal(store.rows[0].sort_order,undefined);
  const found=await exercise({id:ID,db:store.db});
  assert.equal(found.statusCode,200);
  assert.deepEqual(found.body,{id:ID,title:'First',body:'sample'});
  const edited=await exercise({method:'PUT',id:ID,body:{title:'Second',body:'changed'},db:store.db});
  assert.equal(edited.statusCode,200);
  assert.equal(edited.body.body,'changed');
  // Step 3 intentionally allows verified B to read A by ID; Step 4 restricts this.
  const fromB=await exercise({id:ID,user:B,db:store.db});
  assert.equal(fromB.statusCode,200);
  const gone=await exercise({method:'DELETE',id:ID,db:store.db});
  assert.equal(gone.statusCode,200);
  const missing=await exercise({id:ID,db:store.db});
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
