import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runStage12PublicReadOnlyChecks} from '../src/stage12-bundle-check.mjs';
import {runStage12SubmissionChecks} from '../src/stage12-submission-check.mjs';

test('Stage12 restricted submission and separate live checker contracts',async()=>{
 const source=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 assert.match(source,/pathToFileURL\(join\(root, 'src', 'stage12-submission-check\.mjs'\)\)\.href/u);
 assert.match(source,/runStage12SubmissionChecks\(config\)/u);
 assert.doesNotMatch(source,/pathToFileURL\(join\(root, 'src', 'attack-check\.mjs'\)\)\.href/u);
 const wrapper=readFileSync(new URL('../src/attack-check.mjs',import.meta.url),'utf8');
 assert.match(wrapper,/runStage12PublicReadOnlyChecks\(config\)/u);
 assert.doesNotMatch(wrapper,/\b(?:execFileSync|spawn|execSync|fork|require)\s*\(/u);
 assert.match(wrapper,/await import\('\.\/attack-check-legacy\.mjs'\)/u);
 assert.ok(wrapper.indexOf('if (config?.step === 12)') < wrapper.indexOf("await import('./attack-check-legacy.mjs')"));
 assert.doesNotMatch(wrapper,/\b(?:POST|PUT|PATCH|DELETE)\b/u);
 assert.equal([...source.matchAll(/\bexecFileSync\s*\(/gu)].length,1);
 assert.match(source,/'show', '--first-parent', '--format=%H', '--name-only', 'HEAD'/u);
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
   if(path==='/aleph.json')return new Response('{"step":12}',{status:200});
   if(path==='/')return new Response(null,{status:200,headers:{'x-content-type-options':'nosniff'}});
   if(path==='/data.json')return new Response(null,{status:404});
   if(path==='/api/restore')return new Response(null,{status:405});
   return new Response(null,{status:401});
  };
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const rows=await runStage12PublicReadOnlyChecks(config);
  assert.equal(calls.length,8);
  assert.deepEqual(calls.map(x=>x.path),[
   '/data.json','/api/notes','/aleph.json',
   '/api/notes/11111111-1111-4111-8111-111111111111',
   '/','/api/restore','/api/device','/api/operations'
  ]);
  assert.equal(new Set(rows.map(x=>x.attackId)).size,20);
  assert.ok(rows.every(x=>Object.keys(x).sort().join(',')==='attackId,expected,observed,result,stage'));
  assert.ok(rows.every(x=>Number.isInteger(x.stage)&&x.stage>=1&&x.stage<=12));
  assert.ok(rows.every(x=>['blocked','breached','not_run'].includes(x.result)));
  assert.ok(rows.every(x=>(x.observed==='not_run')===(x.result==='not_run')));
  assert.equal(rows.filter(x=>x.result==='not_run').length,12);
  const submitted=runStage12SubmissionChecks(config);
  assert.deepEqual(submitted.map(x=>[x.attackId,x.stage,x.expected]),
    rows.map(x=>[x.attackId,x.stage,x.expected]));
  assert.ok(submitted.every(x=>x.observed==='not_run'&&x.result==='not_run'));
  const result=Object.fromEntries(rows.map(x=>[x.attackId,x]));
  assert.equal(result.deployment_step12_manifest.observed,'HTTP 200');
  assert.equal(result.deployment_step12_manifest.result,'blocked');
  assert.equal(result.home_security_header.result,'blocked');
  assert.equal(result.stage10_anonymous_restore_denied.result,'blocked');
  assert.equal(result.anonymous_note_read_denied.result,'blocked');
  assert.equal(result.stage9_121_burst.result,'not_run');
 }finally{globalThis.fetch=original;}
});

test('submitted Stage12 graph cannot fetch even when network would succeed',()=>{
 const before=globalThis.fetch;let count=0;
 globalThis.fetch=()=>{count++;throw Error('submission must not perform fetch')};
 try{
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const submitted=runStage12SubmissionChecks(config);
  assert.equal(count,0);
  assert.equal(submitted.length,20);
  assert.ok(submitted.every(x=>x.observed==='not_run'&&x.result==='not_run'));
  assert.ok(submitted.every(x=>Object.keys(x).sort().join(',')==='attackId,expected,observed,result,stage'));
 }finally{globalThis.fetch=before;}
});
test('Offline reads remain not_run without fabricated result',async()=>{
 const before=globalThis.fetch;let n=0;
 globalThis.fetch=async()=>{n++;throw new Error('offline');};
 try{
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const rows=await runStage12PublicReadOnlyChecks(config);
  assert.equal(n,8);
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
test('runtime file guard blocks writes outside required submission output',()=>{
 expectSandboxRejection("import {writeFileSync} from 'node:fs';"
  +"writeFileSync('/tmp/byteback-forbidden-write','x')",'node:fs\\.writeFileSync');
 expectSandboxRejection("import {openSync} from 'node:fs';"
  +"openSync('/tmp/byteback-forbidden-open','w')",'node:fs\\.openSync');
});
test('source contains one git show subprocess site and no unapproved alternate spawn site',()=>{
 const source=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 assert.equal([...source.matchAll(/\bexecFileSync\s*\(/gu)].length,1);
 assert.match(source,/execFileSync\('git', \[/u);
 assert.doesNotMatch(source,/\b(?:spawnSync|spawn|fork|execSync|execFile|process\.binding)\s*\(/u);
});
