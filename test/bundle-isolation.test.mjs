import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runStage12PublicReadOnlyChecks} from '../src/stage12-bundle-check.mjs';
import {READ_ONLY_CASES} from '../src/stage12-readonly-fixtures.mjs';

test('Stage12 restricted submission and separate live checker contracts',async()=>{
 const source=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 assert.match(source,/import \{ RULE_IDS \} from '\.\.\/src\/decider\.mjs'/u);
 assert.match(source,/import \{ runStage12PublicReadOnlyChecks \} from '\.\.\/src\/stage12-bundle-check\.mjs'/u);
 assert.match(source,/await runStage12PublicReadOnlyChecks\(config\)/u);
 assert.doesNotMatch(source,/\bawait\s+import\s*\(|node:child_process|execFileSync|node:url/u);
 const wrapper=readFileSync(new URL('../src/attack-check.mjs',import.meta.url),'utf8');
 assert.match(wrapper,/runStage12PublicReadOnlyChecks\(config\)/u);
 assert.doesNotMatch(wrapper,/\b(?:execFileSync|spawn|execSync|fork|require)\s*\(/u);
 assert.match(wrapper,/await import\('\.\/attack-check-legacy\.mjs'\)/u);
 assert.ok(wrapper.indexOf('if (config?.step === 12)') < wrapper.indexOf("await import('./attack-check-legacy.mjs')"));
 assert.doesNotMatch(wrapper,/\b(?:POST|PUT|PATCH|DELETE)\b/u);
 assert.equal([...source.matchAll(/\bexecFileSync\s*\(/gu)].length,0);
 assert.match(source,/gitHead\(root\)/u);
 assert.match(source,/stage12-changed-files\.json/u);
 const checker=readFileSync(new URL('../src/stage12-bundle-check.mjs',import.meta.url),'utf8');
 assert.match(checker,/method: 'GET'/u);
 assert.match(checker,/alephEvidence:/u);
 assert.doesNotMatch(checker,/\b(?:execFileSync|spawn|execSync|fork|await import)\s*\(/u);
 const calls=[],original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{
   const path=new URL(url).pathname;
   calls.push({path,caseId:options.alephEvidence.caseId});
   assert.equal(new URL(url).protocol,'https:');
   assert.equal(options.method,'GET');
   assert.equal(options.redirect,'manual');
   assert.equal(options.credentials,undefined);
   assert.equal(options.headers.accept,'application/json');
   assert.equal(options.alephEvidence.requestKey,'read');
   if(path==='/api/checks'){
    const caseId=options.alephEvidence.caseId;
    assert.equal(new URL(url).searchParams.get('case'),caseId);
    assert.ok(READ_ONLY_CASES.includes(caseId));
    return new Response(JSON.stringify({schema:'aleph.readonly.fixture.v1',
     caseId,source:'fixed_virtual_fixture',ready:true}),{status:200});
   }
   if(path==='/aleph.json')return new Response('{"step":12}',{status:200});
   if(path==='/')return new Response(null,{status:200,headers:{'x-content-type-options':'nosniff'}});
   if(path==='/data.json')return new Response(null,{status:404});
   if(path==='/api/restore')return new Response(null,{status:405});
   return new Response(null,{status:401});
  };
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const rows=await runStage12PublicReadOnlyChecks(config);
  assert.equal(calls.length,19);
  assert.deepEqual(calls.slice(0,8).map(x=>x.path),[
   '/data.json','/api/notes','/aleph.json',
   '/api/notes/11111111-1111-4111-8111-111111111111',
   '/','/api/restore','/api/device','/api/operations'
  ]);
  assert.deepEqual(calls.slice(8).map(x=>x.caseId),READ_ONLY_CASES);
  assert.ok(calls.slice(8).every(x=>x.path==='/api/checks'));
  assert.equal(new Set(rows.map(x=>x.attackId)).size,20);
  assert.ok(rows.every(x=>Object.keys(x).sort().join(',')==='attackId,expected,observed,result,stage'));
  assert.ok(rows.every(x=>Number.isInteger(x.stage)&&x.stage>=1&&x.stage<=12));
  assert.ok(rows.every(x=>['blocked','breached','not_run'].includes(x.result)));
  assert.ok(rows.every(x=>(x.observed==='not_run')===(x.result==='not_run')));
  assert.equal(rows.filter(x=>x.result==='not_run').length,1);
  assert.equal(rows.filter(x=>x.observed!=='not_run').length,19);
  const result=Object.fromEntries(rows.map(x=>[x.attackId,x]));
  assert.equal(result.deployment_step12_manifest.observed,'HTTP 200');
  assert.equal(result.deployment_step12_manifest.result,'blocked');
  assert.equal(result.home_security_header.result,'blocked');
  assert.equal(result.stage10_anonymous_restore_denied.result,'blocked');
  assert.equal(result.anonymous_note_read_denied.result,'blocked');
  assert.equal(result.stage9_121_burst.result,'blocked');
  assert.equal(result.stage8_announcement_edit_denied.result,'not_run');
 }finally{globalThis.fetch=original;}
});

test('false public fixture result cannot be counted as blocked',async()=>{
 const prior=globalThis.fetch;
 try{
  globalThis.fetch=async(url)=>{
   const u=new URL(url);
   if(u.pathname==='/api/checks')return new Response(JSON.stringify({
    schema:'aleph.readonly.fixture.v1',caseId:u.searchParams.get('case'),
    source:'fixed_virtual_fixture',ready:false
   }),{status:200});
   if(u.pathname==='/aleph.json')return new Response('{"step":12}',{status:200});
   if(u.pathname==='/')return new Response(null,{status:200,headers:{'x-content-type-options':'nosniff'}});
   return new Response(null,{status:401});
  };
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const rows=await runStage12PublicReadOnlyChecks(config);
  const affected=rows.filter(x=>READ_ONLY_CASES.includes(x.attackId));
  assert.equal(affected.length,11);
  assert.ok(affected.every(x=>x.observed==='HTTP 200'&&x.result==='breached'));
  assert.equal(rows.find(x=>x.attackId==='stage8_announcement_edit_denied').result,'not_run');
 }finally{globalThis.fetch=prior;}
});
test('Git HEAD is read from allowed filesystem; manifest is explicit',()=>{
 const source=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 const list=JSON.parse(readFileSync(new URL('../scripts/stage12-changed-files.json',import.meta.url),'utf8'));
 assert.ok(list.length>=5);
 assert.equal(list.length,new Set(list).size);
 assert.ok(list.includes('scripts/stage12-changed-files.json'));
 assert.match(source,/readFileSync\(join\(directory,'HEAD'\)/u);
 assert.doesNotMatch(source,/\b(?:execFileSync|child_process|spawnSync)\b/u);
});
test('Offline reads remain not_run without fabricated result',async()=>{
 const before=globalThis.fetch;let n=0;
 globalThis.fetch=async()=>{n++;throw new Error('offline');};
 try{
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const rows=await runStage12PublicReadOnlyChecks(config);
  assert.equal(n,19);
  assert.ok(rows.every(x=>x.observed==='not_run'&&x.result==='not_run'));
 }finally{globalThis.fetch=before;}
});

test('Unexpected protected HTTP 200 is breached and no private response body is read',async()=>{
 const before=globalThis.fetch;let reads=0;
 try{
  globalThis.fetch=async url=>{
   const path=new URL(url).pathname;
   const res=path==='/aleph.json'
    ?new Response('{"step":12}',{status:200})
    :new Response(null,{status:path==='/api/notes'?200:401});
   if(path==='/api/notes')res.text=async()=>{reads++;throw Error('private response accessed');};
   return res;
  };
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const result=await runStage12PublicReadOnlyChecks(config);
  assert.equal(result.find(x=>x.attackId==='anonymous_note_read_denied').observed,'HTTP 200');
  assert.equal(result.find(x=>x.attackId==='anonymous_note_read_denied').result,'breached');
  assert.equal(reads,0);
 }finally{globalThis.fetch=before;}
});

const isolationRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const publicApp='https://choi-bujang-secret-vault-six-jet.vercel.app/';
function diagnose(code,extra={}){
 const result=spawnSync(process.execPath,['--import','./test/bundle-isolation-preload.mjs',
  '--input-type=module','--eval',code],{
   cwd:isolationRoot,encoding:'utf8',timeout:12000,
   env:{...process.env,BUNDLE_ISOLATION_DIAGNOSTIC:'1',...extra},
  });
 if(result.error)throw result.error;
 return result;
}
function expectSandboxRejection(code,pattern,env={}){
 const result=diagnose(code,env);
 assert.notEqual(result.status,0,'A prohibited operation unexpectedly succeeded');
 assert.match(result.stderr,new RegExp('BUNDLE_ISOLATION: FORBIDDEN '+pattern,'u'),
  'The operation failed for an unrelated reason, not the sandbox:\n'+result.stderr.slice(-1200));
}
test('actual runtime guard rejects all non-Git commands before they execute',()=>{
 expectSandboxRejection(
  "import {execFileSync} from 'node:child_process';execFileSync(process.execPath,['--version'])",
  'child_process\\.execFileSync');
 expectSandboxRejection(
  "import {execFileSync} from 'node:child_process';execFileSync('git',['status'])",
  'child_process\\.execFileSync');
});
test('aliased, nested, and alternative subprocess APIs are blocked',()=>{
 expectSandboxRejection(
  "import {execFileSync as run} from 'node:child_process';const hidden=()=>run('git',['config','--list']);hidden()",
  'child_process\\.execFileSync');
 for(const action of ['spawnSync','execSync','fork'])
  expectSandboxRejection("import {"+action+"} from 'node:child_process';"
    +action+"(process.execPath,['--version'])",'child_process\\.'+action);
});
test('indirectly loaded module cannot run an unapproved child process',()=>{
 const dir=mkdtempSync(join(tmpdir(),'byteback-bundle-mutation-'));
 try{
  const entry=join(dir,'entry.mjs'),helper=join(dir,'helper.mjs');
  writeFileSync(entry,"import './helper.mjs';\n");
  writeFileSync(helper,"import {execFileSync} from 'node:child_process';execFileSync(process.execPath,['--version']);\n");
  expectSandboxRejection('await import('+JSON.stringify(pathToFileURL(entry).href)+')',
   'child_process\\.execFileSync',{BUNDLE_ISOLATION_PROBE_FILE:entry});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Stage12 isolation rejects the legacy attack-check-legacy.mjs module graph',()=>{
 const legacy = new URL('../src/attack-check-legacy.mjs',import.meta.url).href;
 expectSandboxRejection('await import('+JSON.stringify(legacy)+')','file import');
});
test('runtime module resolver blocks forbidden builtin, package and file imports',()=>{
 expectSandboxRejection("await import('node:os')",'builtin import');
 expectSandboxRejection("await import('jose')",'file import');
 const dir=mkdtempSync(join(tmpdir(),'byteback-import-mutation-'));
 try{
  const file=join(dir,'outside.mjs');writeFileSync(file,'export const ok=true;\n');
  expectSandboxRejection('await import('+JSON.stringify(pathToFileURL(file).href)+')','file import');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('runtime network guard rejects write verbs and nonpublic URLs',()=>{
 for(const method of ['POST','PUT','PATCH','DELETE'])
  expectSandboxRejection('await fetch('+JSON.stringify(publicApp)+',{method:'+JSON.stringify(method)+'})',
    'fetch');
 expectSandboxRejection("await fetch('http://127.0.0.1:1234/')",'fetch');
});
test('caught forbidden network request remains a failure in the sticky ledger',()=>{
 const result=diagnose("try{await fetch('https://choi-bujang-secret-vault-six-jet.vercel.app/aleph.json',{method:'POST'})}catch{};");
 assert.notEqual(result.status,0,'Caught forbidden operation must still fail the process');
 assert.match(result.stderr,/BUNDLE_ISOLATION: FORBIDDEN_ATTEMPT_LEDGER/u);
 assert.match(result.stderr,/FORBIDDEN fetch POST/u);
});
test('caught non-public URL remains a failure in the sticky ledger',()=>{
 const result=diagnose("try{await fetch('http://127.0.0.1:1234/')}catch{};");
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/BUNDLE_ISOLATION: FORBIDDEN_ATTEMPT_LEDGER/u);
});
test('caught unauthorized file access remains a failure in the sticky ledger',()=>{
 const result=diagnose("try{const f=await import('node:fs');f.readFileSync('/tmp/forbidden-sticky-test','utf8')}catch{};");
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/BUNDLE_ISOLATION: FORBIDDEN_ATTEMPT_LEDGER/u);
});
test('caught forbidden child process remains a failure in the sticky ledger',()=>{
 const result=diagnose("try{const c=await import('node:child_process');c.execFileSync('git',['status'])}catch{};");
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/BUNDLE_ISOLATION: FORBIDDEN_ATTEMPT_LEDGER/u);
});
test('diagnostic mock confirms public GET and HEAD are permitted, without external requests',()=>{
 const result=diagnose('for(const method of [\"GET\",\"HEAD\"]){'
  +'const r=await fetch('+JSON.stringify(publicApp)+',{method});'
  +'if(r.status!==204)throw Error(\"unexpected mock status\");}');
 assert.equal(result.status,0,result.stderr);
});
test('guarded public GET is allowed but represented as offline not_run',()=>{
 const result=diagnose("try{await fetch('https://choi-bujang-secret-vault-six-jet.vercel.app/aleph.json',{method:'GET'})}catch(e){if(!String(e.message).includes('offline public read fixture'))throw e}");
 assert.equal(result.status,0,result.stderr);
});
test('caught asynchronous forbidden filesystem write is recorded',()=>{
 const result=diagnose("try{const fs=await import('node:fs');await fs.promises.writeFile('/tmp/forbidden-async','x')}catch{}");
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/BUNDLE_ISOLATION: FORBIDDEN_ATTEMPT_LEDGER/u);
 assert.match(result.stderr,/FORBIDDEN node:fs.promises.writeFile/u);
});
test('every child process is rejected, even a Git read',()=>{
 const result=diagnose("try{const c=await import('node:child_process');c.execFileSync('git',['show','HEAD'])}catch{}");
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/BUNDLE_ISOLATION: FORBIDDEN_ATTEMPT_LEDGER/u);
});
test('runtime file guard blocks writes outside required submission output',()=>{
 expectSandboxRejection("import {writeFileSync} from 'node:fs';"
  +"writeFileSync('/tmp/byteback-forbidden-write','x')",'node:fs\\.writeFileSync');
 expectSandboxRejection("import {openSync} from 'node:fs';"
  +"openSync('/tmp/byteback-forbidden-open','w')",'node:fs\\.openSync');
});
test('source contains no child process but does read the Git repository',()=>{
 const source=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 assert.equal([...source.matchAll(/\bexecFileSync\s*\(/gu)].length,0);
 assert.match(source,/readFileSync\(join\(directory,'HEAD'\)/u);
 assert.doesNotMatch(source,/\b(?:spawnSync|spawn|fork|execSync|execFile|process\.binding)\s*\(/u);
});
