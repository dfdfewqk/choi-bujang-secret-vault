import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runStage12PublicReadOnlyChecks} from '../src/stage12-bundle-check.mjs';

test('bundle is Git-read-only and makes zero outbound requests',async()=>{
 const source=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 assert.match(source,/execFileSync\('git', \[/u);
 assert.match(source,/'show', '--first-parent', '-m', '--pretty=format:%H', '--name-only', 'HEAD'/u);
 assert.match(source,/from '\.\.\/src\/stage12-bundle-check\.mjs'/u);
 assert.doesNotMatch(source,/\bawait import\(/u);
 assert.doesNotMatch(source,/\bgitRead\s*\(/u);
 assert.equal([...source.matchAll(/\bexecFileSync\s*\(/gu)].length,1);
 assert.doesNotMatch(source,/\b(?:spawn|spawnSync|execSync|fork)\s*\(/u);
 const checker=readFileSync(new URL('../src/stage12-bundle-check.mjs',import.meta.url),'utf8');
 const imports=[...source.matchAll(/from '([^']+)'/gu),...checker.matchAll(/from '([^']+)'/gu)].map(m=>m[1]);
 assert.ok(imports.every(p=>p.startsWith('../src/')||['node:child_process','node:fs','node:path'].includes(p)));
 assert.doesNotMatch(checker,/\bawait import\(|\bexecFileSync\b|\bspawn\b|\bcreateHash\b|\brandomUUID\b/u);
 assert.doesNotMatch(source,/readFileSync\(join\(root, 'bundle-notes\.json'\)/u);
 assert.match(source,/const notes = \{/u);
 assert.match(source,/official_41_tests_and_identity_revocation_not_verified/u);
 assert.ok(readFileSync(new URL('../.gitignore',import.meta.url),'utf8').split(/\r?\n/u).includes('bundle-notes.json'));
 assert.doesNotMatch(checker,/\bfetch\s*\(|\bhttps?:\/\//u);
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{requests++;throw Error('network not permitted in bundle');};
 try{
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const checks=await runStage12PublicReadOnlyChecks(config);
  assert.equal(requests,0);
  assert.equal(checks.length,20);
  assert.equal(new Set(checks.map(c=>c.attackId)).size,20);
  assert.ok(checks.every(c=>Object.keys(c).sort().join(',')==='attackId,expected,observed'));
  assert.ok(checks.every(c=>c.observed==='not_run'));
 }finally{globalThis.fetch=original;}
});

test('stage 12 output needs no fetch API in an offline sandbox',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('network unavailable');};
  try{
    const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
    const checks=await runStage12PublicReadOnlyChecks(config);
    assert.equal(checks.length,20);
    assert.ok(checks.every(c=>c.observed==='not_run'));
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
