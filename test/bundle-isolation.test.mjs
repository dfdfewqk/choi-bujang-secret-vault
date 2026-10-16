import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runStage12PublicReadOnlyChecks} from '../src/stage12-bundle-check.mjs';

test('Stage12 submission imports remain allowlisted and safe GETs are actually measured',async()=>{
 const source=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 assert.match(source,/execFileSync\('git', \[/u);
 assert.match(source,/'show', '--first-parent', '-m', '--pretty=format:%H', '--name-only', 'HEAD'/u);
 assert.match(source,/from '\.\.\/src\/stage12-bundle-check\.mjs'/u);
 assert.equal([...source.matchAll(/\bexecFileSync\s*\(/gu)].length,1);
 assert.doesNotMatch(source,/\b(?:spawn|spawnSync|execSync|fork|await import)\s*\(/u);
 const checker=readFileSync(new URL('../src/stage12-bundle-check.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(checker,/\b(?:execFileSync|spawn|execSync|fork|await import)\s*\(/u);
 assert.match(checker,/method: 'GET'/u);
 assert.match(checker,/alephEvidence:/u);
 assert.doesNotMatch(source,/readFileSync\(join\(root, 'bundle-notes\.json'\)/u);
 assert.match(source,/official_41_tests_and_identity_revocation_not_verified/u);
 assert.ok(readFileSync(new URL('../.gitignore',import.meta.url),'utf8')
   .split(/\r?\n/u).includes('bundle-notes.json'));

 const original=globalThis.fetch, calls=[];
 try{
  globalThis.fetch=async(url,options)=>{
   const value=new URL(url);
   calls.push(value.pathname);
   assert.equal(value.protocol,'https:');
   assert.equal(value.hostname,'choi-bujang-secret-vault-six-jet.vercel.app');
   assert.equal(options.method,'GET');
   assert.equal(options.redirect,'error');
   assert.equal(options.credentials,'omit');
   assert.equal(options.alephEvidence.requestKey,'read');
   assert.equal(typeof options.alephEvidence.caseId,'string');
   assert.equal(options.headers.accept,'application/json');
   assert.equal(options.body,undefined);
   if(value.pathname==='/aleph.json')
    return new Response(JSON.stringify({step:12}),{status:200,
     headers:{'content-type':'application/json'}});
   if(value.pathname==='/')return new Response(null,{status:200,
    headers:{'x-content-type-options':'nosniff'}});
   if(value.pathname==='/data.json')return new Response(null,{status:404});
   if(value.pathname==='/api/restore')return new Response(null,{status:405});
   return new Response(null,{status:401});
  };
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const checks=await runStage12PublicReadOnlyChecks(config);
  assert.equal(calls.length,8,'Eight safe anonymous reads must be attempted');
  assert.equal(new Set(calls).size,8);
  assert.equal(checks.length,20);
  assert.equal(new Set(checks.map(c=>c.attackId)).size,20);
  assert.ok(checks.every(c=>Object.keys(c).sort().join(',')==='attackId,expected,observed'));
  assert.equal(checks.filter(c=>c.observed==='not_run').length,12);
  const result=Object.fromEntries(checks.map(c=>[c.attackId,c.observed]));
  assert.equal(result.deployment_step12_manifest,'HTTP 200; manifestStep=12');
  assert.equal(result.anonymous_note_read_denied,'HTTP 401');
  assert.equal(result.stage10_anonymous_restore_denied,'HTTP 405');
  assert.equal(result.home_security_header,'HTTP 200; nosniff=true');
  assert.equal(result.stage9_121_burst,'not_run');
 }finally{globalThis.fetch=original;}
});

test('offline public reads remain not_run and never invent success',async()=>{
 const original=globalThis.fetch;let attempts=0;
 globalThis.fetch=async()=>{attempts++;throw new Error('safe offline test');};
 try{
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const rows=await runStage12PublicReadOnlyChecks(config);
  assert.equal(attempts,8);
  assert.equal(rows.length,20);
  assert.ok(rows.every(r=>r.observed==='not_run'));
 }finally{globalThis.fetch=original;}
});

test('unexpected protected HTTP 200 is recorded without reading private response body',async()=>{
 const original=globalThis.fetch;let bodyReads=0;
 try{
  globalThis.fetch=async(url)=>{
   const p=new URL(url).pathname;
   const res=p==='/aleph.json'
    ?new Response('{"step":12}',{status:200})
    :new Response(null,{status:p==='/api/notes'?200:401});
   if(p==='/api/notes')res.text=async()=>{bodyReads++;throw Error('private content read');};
   return res;
  };
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const rows=await runStage12PublicReadOnlyChecks(config);
  assert.equal(rows.find(r=>r.attackId==='anonymous_note_read_denied').observed,'HTTP 200');
  assert.equal(bodyReads,0);
 }finally{globalThis.fetch=original;}
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
