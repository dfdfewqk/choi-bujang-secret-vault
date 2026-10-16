import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyAuditHeader} from '../public/operations-health.mjs';

test('telemetry status must differentiate saved, failed and missing audit',()=>{
 assert.equal(classifyAuditHeader(new Headers({'X-Audit-Recorded':'true'})).state,'verified');
 assert.equal(classifyAuditHeader(new Headers({'X-Audit-Recorded':'false'})).state,'failed');
 assert.equal(classifyAuditHeader(new Headers()).state,'unknown');
 assert.equal(classifyAuditHeader(null).state,'unknown');
 assert.notEqual(classifyAuditHeader(new Headers({'X-Audit-Recorded':'FALSE'})).state,'verified');
});
test('operation room shows real audit evidence and retains failure counter',()=>{
 const html=readFileSync(new URL('../public/operations.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../public/operations-client.mjs',import.meta.url),'utf8');
 assert.match(html,/id="operations-audit-health"/u);
 assert.match(script,/updateAuditHealth\(response\.headers\)/u);
 assert.match(script,/if\(evidence\.state==='failed'\)auditFailures\+\+/u);
 assert.match(script,/missingAuditHealth\(\)/u);
});
test('npm run bundle invokes the exact check function inspected by Stage12 tests',()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const packageJson=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
 const source=readFileSync(resolve(root,'scripts/bundle.mjs'),'utf8');
 assert.equal(packageJson.scripts.bundle,'node scripts/bundle.mjs');
 assert.match(source,/import \{ runStage12PublicReadOnlyChecks \} from '\.\.\/src\/stage12-bundle-check\.mjs'/u);
 assert.match(source,/await runStage12PublicReadOnlyChecks\(config\)/u);
});
test('entire npm run bundle import closure stays within judge builtin allowlist',()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const queue=['scripts/bundle.mjs'],seen=new Set();
 const allowed=new Set(['node:fs','node:path','node:url','node:child_process','node:crypto']);
 while(queue.length) {
  const rel=queue.pop();
  if(seen.has(rel))continue;seen.add(rel);
  const source=readFileSync(resolve(root,rel),'utf8');
  const imports=/\bimport\s+(?:[^\n;]*?\s+from\s+)?['"]([^'"]+)['"]/gu;
  for(const m of source.matchAll(imports)){
   const item=m[1];
   if(item.startsWith('node:'))assert.ok(allowed.has(item),'Forbidden Node module '+item);
   else {
    assert.ok(item.startsWith('.'),'Forbidden dependency '+item+' in '+rel);
    const target=resolve(dirname(resolve(root,rel)),item);
    assert.ok(target.startsWith(root+'/'),'Relative import escaped repository');
    queue.push(target.slice(root.length+1));
   }
  }
  assert.doesNotMatch(source,/\bawait\s+import\s*\(/u,'Dynamic import in '+rel);
  if(rel==='src/stage12-bundle-check.mjs'){
   assert.match(source,/method: 'GET'/u);
   assert.doesNotMatch(source,/method:\s*'(?:POST|PUT|DELETE|PATCH)'/u);
  }else assert.doesNotMatch(source,/\bfetch\s*\(/u,'Unexpected network in '+rel);
 }
 assert.deepEqual([...seen].sort(),[
  'scripts/bundle.mjs','src/decider.mjs','src/resource-zones.mjs','src/stage12-bundle-check.mjs'
 ].sort());
});
test('CI-only guard checks runtime imports, ESM named bindings and process execution',()=>{
 const preload=readFileSync(new URL('./bundle-isolation-preload.mjs',import.meta.url),'utf8');
 assert.match(preload,/registerHooks\(/u);
 assert.match(preload,/syncBuiltinESMExports\(\)/u);
 assert.match(preload,/child\[name\]=/u);
 assert.match(preload,/FORBIDDEN file import/u);
 assert.match(preload,/FORBIDDEN fetch/u);
});
test('TLS checks are independent of official submission execution',()=>{
 const bundle=readFileSync(new URL('../scripts/bundle.mjs',import.meta.url),'utf8');
 const monitor=readFileSync(new URL('../scripts/check-public-availability.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(bundle,/check-public-availability|node:tls|operations-health/u);
 assert.match(monitor,/rejectUnauthorized:true/u);
 assert.match(monitor,/method:'HEAD'/u);
});
