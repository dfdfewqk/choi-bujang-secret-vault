import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

const load = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('stage 5 keeps note CRUD and browser Auth behind server functions', async () => {
  const pages = await Promise.all([
    load('public/index.html'),
    load('public/access-check.html'),
    load('public/signup.html'),
  ]);
  for (const page of pages) {
    assert.doesNotMatch(page, /supabase\s*\.\s*from\s*\(/iu);
    assert.doesNotMatch(page, /\.from\s*\(\s*['"]vault_training_notes['"]/iu);
    assert.doesNotMatch(page, /supabase\s*\.\s*rpc\s*\(/iu);
    assert.doesNotMatch(page, /supabase\s*\.\s*storage\s*\./iu);
    assert.doesNotMatch(page, /\/rest\/v1\/vault_training_notes/iu);
    assert.doesNotMatch(page, /sb_secret_[A-Za-z0-9_-]{12,}/u);
    assert.doesNotMatch(page, /sb_publishable_[A-Za-z0-9_-]+/u);
    assert.doesNotMatch(page, /esm\.sh\/@supabase/u);
  }
  assert.match(pages[0], /['"]\/api\/notes['"]/u);
  assert.match(pages[0], /supabase\.auth\.signInWithPassword/u);
  assert.match(pages[0], /supabase\.auth\.signOut/u);
  assert.match(pages[2], /supabase\.auth\.signUp/u);
  assert.match(pages[1], /fetch\('\/api\/notes'/u);
  for (const page of pages) assert.match(page, /createServerAuthClient\(\)/u);
  assert.match(await load('public/auth-client.mjs'), /fetch\('\/api\/auth'/u);

  const api = await load('src/notes-api.mjs');
  assert.match(api, /process\.env\.SUPABASE_SECRET_KEY/u);
  assert.match(api, /createLoginVerifier/u);
  assert.match(api, /\.eq\('owner_id', verified\.userId\)/u);
  assert.match(api, /OWNER_ID_NOT_ALLOWED/u);
});

test('stage 5 original data API URL is the query-free notes endpoint', async () => {
  const config = JSON.parse(await load('aleph.config.json'));
  assert.equal(config.step, 5);
  assert.equal(config.originalApiUrl,
    'https://bcwzllejypavwgsfqfbm.supabase.co/rest/v1/vault_training_notes');
  const url = new URL(config.originalApiUrl);
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  assert.equal(config.identityProvider.audience, 'authenticated');
  assert.deepEqual(config.allowedRoutes, [
    'GET /api/notes', 'POST /api/notes', 'GET /api/notes/:id',
    'PUT /api/notes/:id', 'DELETE /api/notes/:id',
  ]);
  const vercel = JSON.parse(await load('vercel.json'));
  assert.ok(vercel.headers.some(h => h.headers.some(header =>
    header.key.toLowerCase() === 'x-content-type-options' && header.value === 'nosniff')));
});

test('stage 5 SQL proposes only notes-table role revocation and never deletes rows', async () => {
  const script = await load('supabase/step5_revoke_direct_notes_review.sql');
  const audit = await load('supabase/step5_verify_permissions.sql');
  assert.match(script, /REVOKE ALL PRIVILEGES ON TABLE public\.vault_training_notes\s+FROM PUBLIC, anon, authenticated/u);
  assert.match(script, /service_role/u);
  assert.match(script, /has_table_privilege\('service_role'/u);
  assert.match(script, /BEGIN;/u);
  assert.match(script, /COMMIT;/u);
  assert.doesNotMatch(script, /\bDELETE\s+FROM\s+public\.vault_training_notes/iu);
  assert.doesNotMatch(script, /\bDROP\s+TABLE\b/iu);
  assert.doesNotMatch(script, /\bALTER\s+TABLE\b/iu);
  assert.doesNotMatch(script, /\bGRANT\s+\w+\s+ON\s+TABLE\b/iu);
  assert.match(audit, /has_table_privilege\(/u);
  assert.match(audit, /pg_policies/u);
  assert.match(audit, /information_schema\.role_table_grants/u);
  assert.doesNotMatch(audit, /\bREVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE\b/iu);
});

test('stage 5 self-check labels original key/JWT access as untested until real SQL execution', async () => {
  const config = JSON.parse(await load('aleph.config.json'));
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async input => {
      const u = new URL(input);
      if (u.pathname === '/data.json') return new Response(null, { status:404 });
      if (u.pathname === '/aleph.json') {
        return new Response(JSON.stringify({step:5}), {status:200});
      }
      if (u.pathname.startsWith('/api/notes')) {
        return new Response(JSON.stringify({error:'UNAUTHORIZED'}),
          {status:401,headers:{'content-type':'application/json'}});
      }
      return new Response('<html>signInWithPassword signOut</html>', {
        status:200, headers:{'X-Content-Type-Options':'nosniff'},
      });
    };
    const reports = await runAttackChecks(config);
    assert.ok(reports.some(r => r.attackId === 'deployment_step5_manifest'
      && !r.observed.startsWith('FAIL')));
    const direct = reports.find(r => r.attackId === 'original_data_api_access');
    assert.match(direct.observed, /NOT_TESTED/u);
    assert.ok(reports.every(r => Object.keys(r).sort().join(',') === 'attackId,expected,observed'));
  } finally {
    globalThis.fetch = oldFetch;
  }
});
