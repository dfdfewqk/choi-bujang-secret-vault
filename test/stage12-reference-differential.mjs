// CI-only differential experiment. Never import this file from npm run bundle.
// Runs the fixed 53-point reference and this PR in the SAME Node process version,
// using a deterministic in-memory HTTP fixture. Nothing contacts the live apps.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const local=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const refSha='923505eaec47df059ba941ddef6ef36f68e7aada';
const refRepo='https://github.com/gkacksdnjs22-stack/choi-bujang-secret-vault.git';
const tmp=mkdtempSync(join(tmpdir(),'byteback-53point-'));
function run(command,args,cwd,timeout=120000){
  const proc=spawnSync(command,args,{cwd,encoding:'utf8',timeout,maxBuffer:1024*1024,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'}});
  if(proc.error||proc.status!==0)
    throw Error('Comparison command failed: '+command+' '+args[0]+' (exit '+proc.status+
      ') '+String(proc.stderr??proc.error??'').slice(0,500));
  return proc;
}
function bundle(dir,preload){
  // The fixture uses the same external fetch behavior for both implementations,
  // so differences reflect module loading and evidence formats, NOT live servers.
  run(process.execPath,['--import',preload,'scripts/bundle.mjs'],dir,90000);
  const json=JSON.parse(readFileSync(join(dir,'artifacts/submission.json'),'utf8'));
  assert.equal(json.schema,'aleph.defense.submission.v2');
  assert.equal(json.step,12);
  assert.match(json.commit,/^[a-f0-9]{40}$/u);
  assert.equal(json.repoUrl.toLowerCase().startsWith('https://github.com/'),true);
  assert.ok(Array.isArray(json.changedFiles)&&json.changedFiles.length>0);
  assert.ok(Array.isArray(json.attackAttempts)&&json.attackAttempts.length>0&&json.attackAttempts.length<=20);
  assert.ok(json.attackAttempts.every(row=>Object.keys(row).sort().join(',')==='attackId,expected,observed,result,stage'));
  assert.ok(json.attackAttempts.every(row=>(row.observed==='not_run')===(row.result==='not_run')));
  return {
    checks:json.attackAttempts.length,
    observed:json.attackAttempts.filter(x=>x.observed!=='not_run').length,
    notRun:json.attackAttempts.filter(x=>x.observed==='not_run').length,
    blocked:json.attackAttempts.filter(x=>x.result==='blocked').length,
    breached:json.attackAttempts.filter(x=>x.result==='breached').length,
    keys:Object.keys(json.attackAttempts[0]).sort(),
    hasCheckedAt:Number.isFinite(Date.parse(json.checkedAt)),
  };
}
try{
  const reference=join(tmp,'reference');mkdirSync(reference);
  run('git',['init','-q'],reference);
  run('git',['remote','add','origin',refRepo],reference);
  run('git',['fetch','--quiet','--no-tags','--depth','1','origin',refSha],reference);
  run('git',['checkout','-q','--detach','FETCH_HEAD'],reference);
  assert.equal(run('git',['rev-parse','HEAD'],reference).stdout.trim(),refSha);
  // The reference requires its local *ignored* explanatory note. Create a
  // harmless synthetic fixture only in the temporary checkout, not in Git.
  writeFileSync(join(reference,'bundle-notes.json'),JSON.stringify({
    explanation:'CI-only fixed-reference observation comparison, not official scoring',
    blockedAt:null,
  }),{encoding:'utf8',flag:'wx'});
  const preload=join(tmp,'safe-public-get-fixture.mjs');
  const fixture=[
    '// Offline HTTP fixture. Real network requests are forbidden.',
    'globalThis.fetch=async(input,options={})=>{',
    ' const url=new URL(input),method=String(options.method??"GET").toUpperCase();',
    ' if(url.protocol!=="https:"||!url.hostname.endsWith(".vercel.app")||',
    '    !["GET","HEAD"].includes(method)||options.body!==undefined)',
    '   throw Error("Forbidden differential HTTP operation");',
    ' const path=url.pathname;',
    ' if(path==="/aleph.json")return new Response(JSON.stringify({step:12}),{status:200});',
    ' if(path==="/")return new Response("",{status:200,headers:{"x-content-type-options":"nosniff"}});',
    ' if(path==="/api/checks")return new Response(JSON.stringify({source:"fixed_virtual_fixture",ready:true}),{status:200});',
    ' const status=(path==="/api/restore"?405:path==="/data.json"||path==="/notes.json"?404:401);',
    ' return new Response(JSON.stringify({error:"UNAUTHORIZED"}),{status});',
    '};'
  ].join('\n')+'\n';
  writeFileSync(preload,fixture,{encoding:'utf8',flag:'wx'});
  const candidate=bundle(local,preload);
  const passReference=bundle(reference,preload);
  const legacy=readFileSync(join(local,'src/attack-check.mjs'),'utf8');
  const refChecker=readFileSync(join(reference,'src/attack-check.mjs'),'utf8');
  const lexicalImports={
    candidate:(legacy.match(/\bawait\s+import\s*\(/gu)??[]).length,
    reference:(refChecker.match(/\bawait\s+import\s*\(/gu)??[]).length,
  };
  assert.deepEqual(candidate.keys,['attackId','expected','observed','result','stage']);
  assert.deepEqual(candidate.keys,passReference.keys);
  assert.equal(candidate.hasCheckedAt,true);
  assert.equal(passReference.hasCheckedAt,true);
  assert.equal(candidate.checks,20);
  assert.equal(passReference.checks,13);
  assert.equal(candidate.observed,8);
  assert.equal(candidate.notRun,12);
  assert.equal(passReference.observed,13);
  assert.equal(passReference.notRun,0);
  process.stdout.write(JSON.stringify({
    comparison:'same Node version and offline GET fixture; NOT official judge',
    node:process.version,referenceCommit:refSha,
    candidate,reference:passReference,
    lexicalLegacyDynamicImports:lexicalImports,
  },null,2)+'\n');
}finally{rmSync(tmp,{recursive:true,force:true});}
