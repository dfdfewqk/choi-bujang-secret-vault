// Stage 5 live production checks: never log tokens, passwords or note bodies.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root,'aleph.config.json'),'utf8'));
if(config.step !== 5)throw new Error('Expected stage 5 config');
const origin=new URL(config.publicAppUrl);
if(origin.protocol!=='https:')throw new Error('Expected HTTPS origin');
const get=async path=>fetch(new URL(path,origin),{
  redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store'
});
const home=await get('/');
if(home.status!==200 || home.headers.get('x-content-type-options')!=='nosniff'){
 throw new Error('Home HTTP 200 or nosniff missing');
}
const html=await home.text();
if(!html.includes('signInWithPassword') || !html.includes('signOut')){
 throw new Error('Login/logout screen scripts missing');
}
const data=await get('/data.json');
if(data.status!==404){
  const text=await data.text();
  if(text.includes('SAMPLE_NOTE_1'))throw new Error('Public static notes leaked');
  // Contract accepts 404 or zero notes, not arbitrary non-JSON HTML.
  let parsed;try{parsed=JSON.parse(text)}catch{throw new Error('data.json is neither 404 nor empty JSON');}
  if(!Array.isArray(parsed.notes)||parsed.notes.length!==0)throw new Error('Public notes not empty');
}
const manifest=await get('/aleph.json');
const m=await manifest.json();
if(!manifest.ok || m.step!==5 || m.schema!=='aleph.defense.deployment.v1'
   || m.repoUrl!==config.repoUrl)throw new Error('Stage 5 deployment manifest mismatch');
const checkApi=async path=>{
  const response=await get(path);
  let body;
  try{body=await response.json()}catch{throw new Error(path+' returned non-JSON');}
  if(![401,403].includes(response.status) || !body?.error || body?.notes){
    throw new Error(path+' did not reject anonymous request');
  }
  return response.status;
};
const listStatus=await checkApi('/api/notes');
const itemStatus=await checkApi('/api/notes/11111111-1111-4111-8111-111111111111');
const result={
 productionAppUrl:origin.href,
 home:{httpStatus:home.status,securityHeader:'nosniff',authUiPresent:true},
 dataJson:{httpStatus:data.status,publicNoteCount:0},
 alephJson:{httpStatus:manifest.status,step:m.step},
 anonymousList:{httpStatus:listStatus,jsonError:true},
 anonymousItem:{httpStatus:itemStatus,jsonError:true},
 originalDataApiUrl:config.originalApiUrl,
 directDataApiPrivilege:'Public/anon/authenticated table privileges revoked by approved SQL migration. Publishable-key GET/PATCH denial is independently tested.',
 residualRisk:'Server checks owner_id; service_role bypasses RLS and must remain server-only.',
 authenticatedCrud:'User reported successful A/B browser operations. DB authenticated/anon direct SELECT denied; real signed JWT direct HTTPS probe is not independently performed by this workflow.',
};
await mkdir(resolve(root,'artifacts'),{recursive:true});
await writeFile(resolve(root,'artifacts','stage5-live-check.json'),JSON.stringify(result,null,2)+'\n');
console.log('STAGE5 LIVE PASS: home nosniff; public notes zero; aleph step 5; list and item anonymous JSON denied');
