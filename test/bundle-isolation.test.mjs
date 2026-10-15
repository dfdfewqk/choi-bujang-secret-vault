import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runStage12PublicReadOnlyChecks} from '../src/stage12-bundle-check.mjs';

test('bundle uses direct git read subcommands and HTTPS read-only checks',async()=>{
 const source=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 assert.match(source,/execFileSync\('git', args, \{/u);
 assert.match(source,/gitRead\('show', '--first-parent', '-m', '--pretty=format:%H', '--name-only', 'HEAD'\)/u);
 assert.match(source,/from '\.\.\/src\/stage12-bundle-check\.mjs'/u);
 assert.doesNotMatch(source,/\bawait import\(/u);
 assert.doesNotMatch(source,/\bgitRead\('(status|diff-tree|config|remote|rev-parse)'/u);
 const commands=[...source.matchAll(/\bgitRead\('([^']+)'/gu)].map(m=>m[1]);
 assert.deepEqual(commands,['show']);
 const checker=readFileSync(new URL('../src/stage12-bundle-check.mjs',import.meta.url),'utf8');
 const imports=[...source.matchAll(/from '([^']+)'/gu),...checker.matchAll(/from '([^']+)'/gu)].map(m=>m[1]);
 assert.ok(imports.every(p=>p.startsWith('../src/')||['node:child_process','node:fs','node:path'].includes(p)));
 assert.doesNotMatch(checker,/\bawait import\(|\bexecFileSync\b|\bspawn\b|\bcreateHash\b|\brandomUUID\b/u);
 assert.match(source,/if \(error\?\.code !== 'ENOENT'\) throw error/u);
 assert.match(source,/official_41_tests_and_identity_revocation_not_verified/u);
 assert.ok(readFileSync(new URL('../.gitignore',import.meta.url),'utf8').split(/\r?\n/u).includes('bundle-notes.json'));
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(input);assert.equal(url.protocol,'https:');
  assert.ok(['/', '/aleph.json', '/data.json'].includes(url.pathname),
    'Protected APIs must not be probed by the submission');
  assert.ok(['GET','HEAD'].includes(options.method??'GET'));
  assert.equal(options.body,undefined);requests++;
  if(url.pathname==='/aleph.json')return Response.json({step:12});
  if(url.pathname==='/data.json')return new Response('',{status:404});
  if(url.pathname==='/')return new Response('',{headers:{'x-content-type-options':'nosniff'}});
  throw new Error('Unexpected HTTP request');
 };
 try{
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const checks=await runStage12PublicReadOnlyChecks(config);
  assert.equal(requests,3);assert.equal(checks.length,20);
  assert.equal(checks.filter(c=>c.observed==='not_run').length,17);
  assert.ok(checks.every(c=>!c.observed.startsWith('FAIL')));
  for (const id of ['anonymous_note_read_denied', 'anonymous_item_read_denied',
    'stage10_anonymous_restore_denied', 'stage11_anonymous_device_denied',
    'stage12_anonymous_operations_denied']) {
    assert.equal(checks.find(c=>c.attackId===id).observed, 'not_run');
  }
 }finally{globalThis.fetch=original;}
});

test('stage 12 does not fabricate successes when every HTTPS GET is unavailable',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('network unavailable');};
  try{
    const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
    const checks=await runStage12PublicReadOnlyChecks(config);
    assert.equal(checks.length,20);
    assert.ok(checks.every(c=>c.observed==='not_run'));
  }finally{globalThis.fetch=original;}
});
