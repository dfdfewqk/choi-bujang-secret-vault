// Stage 5 real HTTPS check against the original Supabase Data API using
// a public key retained SERVER-SIDE for the Auth proxy (NOT a server secret).
// No student credentials, JWTs, note bodies or IDs are printed or exported.
// Tests GET and a PATCH targeting a fresh nonexistent random UUID; no
// production row can be modified by a successful query (unexpected success
// is still treated as a security failure).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('aleph.config.json', 'utf8'));
assert.equal(config.step, 5);
const url = new URL(config.originalApiUrl);
assert.equal(url.protocol, 'https:');
assert.equal(url.pathname, '/rest/v1/vault_training_notes');
assert.equal(url.search, '');
assert.equal(url.hash, '');
assert.ok(url.hostname.endsWith('.supabase.co'));

const html = await readFile('public/index.html', 'utf8');
const browserAuth = await readFile('public/auth-client.mjs', 'utf8');
assert.doesNotMatch(html + browserAuth, /sb_publishable_[A-Za-z0-9_-]+/u);
const serverAuth = await readFile('src/auth-api.mjs', 'utf8');
const key = serverAuth.match(/const\s+SERVER_AUTH_PUBLIC_KEY\s*=\s*['"](sb_publishable_[A-Za-z0-9_-]+)['"]/u)?.[1];
assert.ok(key, 'Server-only Auth public key not found; no HTTPS requests made');

const attempts = [
  { name: 'public_key_direct_get', method: 'GET', endpoint: new URL(url.href) },
  { name: 'public_key_direct_patch_missing_row', method: 'PATCH', endpoint: new URL(url.href) },
];
attempts[0].endpoint.searchParams.set('select', 'note_uuid');
attempts[0].endpoint.searchParams.set('limit', '1');
attempts[1].endpoint.searchParams.set('note_uuid', 'eq.' + randomUUID());

const results = [];
for (const attempt of attempts) {
  const response = await fetch(attempt.endpoint, {
    method: attempt.method,
    headers: {
      apikey: key,
      Accept: 'application/json',
      ...(attempt.method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(attempt.method === 'PATCH'
      ? { body: JSON.stringify({ title: 'STEP5_DENIAL_CHECK' }) }
      : {}),
    signal: AbortSignal.timeout(12000),
    redirect: 'error',
  });
  let body = null;
  try { body = await response.json(); } catch { /* recorded via status */ }
  const permitted = [401, 403].includes(response.status);
  const errorCode = typeof body?.code === 'string' && /^[A-Za-z0-9_]{1,24}$/u.test(body.code)
    ? body.code : null;
  results.push({
    attackId: attempt.name,
    expected: 'HTTP 401 or 403 with publishable apikey and no authenticated JWT',
    status: response.status,
    denied: permitted,
    errorCode,
  });
  console.log(attempt.name + ': HTTP ' + response.status
    + (permitted ? ' DENIED' : ' UNEXPECTED - CHECK DB PRIVILEGES'));
}
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/stage5-original-api-http.json', JSON.stringify({
  step: 5,
  check: 'original Supabase PostgREST, server-held publishable apikey, no authenticated JWT',
  result: results.every(r => r.denied) ? 'PASS' : 'FAIL',
  scope: 'anonymous direct GET and safe PATCH-to-nonexistent-row only',
  authenticatedJwtCheck: 'NOT_TESTED; DB simulated authenticated-role SELECT blocked; real judge test pending',
  attempts: results,
}, null, 2) + '\n');
if (results.some(r => !r.denied)) {
  throw new Error('Stage5 original Data API accepted an anonymous request: direct access not proven blocked');
}
console.log('PASS: original Data API denies anonymous direct GET and PATCH with public apikey');
