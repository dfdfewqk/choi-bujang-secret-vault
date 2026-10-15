import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runAttackChecks} from '../src/attack-check.mjs';

test('bundle uses direct git read subcommands and HTTPS read-only checks',async()=>{
 const source=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 assert.match(source,/execFileSync\('git', args, \{/u);
 assert.match(source,/cwd: root/u);
 assert.match(source,/const checkedSources = \[/u);
 assert.match(source,/git\('show', '--first-parent', '-m', '--pretty=format:', '--name-only', 'HEAD'\)/u);
 const calls=[...source.matchAll(/\bgit\('([^']+)'/gu)].map(m=>m[1]);
 assert.ok(calls.length>=3);
 for(const command of calls)assert.ok(['rev-parse','show'].includes(command),command);
 assert.doesNotMatch(source,/\bgit\('(status|config|remote|diff-tree)'/u);
 assert.doesNotMatch(source,/\bGIT_OPTIONAL_LOCKS\b|\bGIT_TERMINAL_PROMPT\b/u);
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(input);assert.equal(url.protocol,'https:');
  assert.ok(['GET','HEAD'].includes(options.method??'GET'));
  assert.equal(options.body,undefined);requests++;
  if(url.pathname==='/aleph.json')return Response.json({step:12});
  if(url.pathname==='/data.json')return new Response('',{status:404});
  if(url.pathname==='/')return new Response('',{headers:{'x-content-type-options':'nosniff'}});
  return Response.json({error:'UNAUTHORIZED'},{status:401});
 };
 try{
  const config=JSON.parse(readFileSync(new URL('../aleph.config.json',import.meta.url)));
  const checks=await runAttackChecks(config);
  assert.equal(requests,8);assert.equal(checks.length,20);
  assert.ok(checks.every(c=>!c.observed.startsWith('FAIL')));
 }finally{globalThis.fetch=original;}
});
