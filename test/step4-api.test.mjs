// Stage 4: local synthetic data only. No real JWT, user email, or secret is used.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleNotes } from '../src/notes-api.mjs';
import { getAuthCompletion, isSignupEmailReturn } from '../public/auth-feedback.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A_NOTE = '11111111-1111-4111-8111-111111111111';
const B_NOTE = '22222222-2222-4222-8222-222222222222';
const LEGACY = '33333333-3333-4333-8333-333333333333';

function response() {
  const headers = new Map();
  let status, body;
  return {
    get statusCode() { return status; },
    get body() { return body; },
    headers,
    setHeader(key, value) { headers.set(key.toLowerCase(), value); return this; },
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
}

function database(start = []) {
  const rows = structuredClone(start);
  const calls = [];
  let accessCount = 0;
  return {
    rows, calls, get accessCount() { return accessCount; },
    from(tableName) {
      assert.equal(tableName, 'vault_training_notes');
      accessCount++;
      let op = 'select';
      let updateData;
      const conditions = new Map();
      const matching = row => [...conditions].every(([key, value]) => row[key] === value);
      const query = {
        select() { return query; },
        eq(key, value) { conditions.set(key, value); return query; },
        order() { return query; },
        async limit(n) {
          calls.push({ op: 'list', filters: Object.fromEntries(conditions) });
          return { data: rows.filter(matching).slice(0, n).map(x => ({ ...x })), error: null };
        },
        async maybeSingle() {
          calls.push({ op, filters: Object.fromEntries(conditions), updateData });
          const i = rows.findIndex(matching);
          if (i === -1) return { data: null, error: null };
          if (op === 'update') Object.assign(rows[i], updateData);
          return { data: { ...rows[i] }, error: null };
        },
        async insert(input) {
          calls.push({ op: 'insert', input: { ...input } });
          rows.push({ ...input });
          return { error: null };
        },
        update(input) { op = 'update'; updateData = { ...input }; return query; },
        delete() { op = 'delete'; return query; },
        then(accept, reject) {
          calls.push({ op, filters: Object.fromEntries(conditions) });
          let data = [];
          if (op === 'delete') {
            for (let i = rows.length - 1; i >= 0; i--) {
              if (matching(rows[i])) data.push({ note_uuid: rows.splice(i, 1)[0].note_uuid });
            }
          }
          return Promise.resolve({ data, error: null }).then(accept, reject);
        },
      };
      return query;
    },
  };
}

async function request({ db, method = 'GET', id = null, body = null, userId = A,
  kind = 'student', auth = 'Bearer synthetic.not.real' } = {}) {
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'TEST_PLACEHOLDER_NOT_A_KEY';
  const res = response();
  try {
    await handleNotes({ method, body, headers: { authorization: auth } }, res, {
      itemId: id,
      databaseFactory: () => db,
      verifyAuthorization: async () => userId ? { kind, userId } : null,
    });
  } finally {
    if (priorUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = priorKey;
  }
  return res;
}

function samples() {
  return database([
    { note_uuid: A_NOTE, owner_id: A, title: 'A', content: 'Private A', sort_order: 1 },
    { note_uuid: B_NOTE, owner_id: B, title: 'B', content: 'Private B', sort_order: null },
    { note_uuid: LEGACY, owner_id: null, title: 'Unassigned', content: 'Old sample', sort_order: 3 },
  ]);
}

test('A/B lists contain their own rows, not the other user or NULL legacy rows', async () => {
  const db = samples();
  const ra = await request({ db, userId: A });
  const rb = await request({ db, userId: B });
  assert.equal(ra.statusCode, 200);
  assert.equal(rb.statusCode, 200);
  assert.deepEqual(ra.body.notes.map(n => n.id), [A_NOTE]);
  assert.deepEqual(rb.body.notes.map(n => n.id), [B_NOTE]);
  assert.deepEqual(db.calls.filter(c => c.op === 'list').map(c => c.filters.owner_id), [A, B]);
});

test('A/B cannot fetch each other or unassigned notes by UUID; unknown UUID is identical 404', async () => {
  const db = samples();
  for (const [userId, id] of [[A, B_NOTE], [B, A_NOTE], [A, LEGACY], [B, LEGACY],
    [A, '99999999-9999-4999-8999-999999999999']]) {
    const res = await request({ db, userId, id });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'NOT_FOUND' });
  }
  assert.equal((await request({ db, userId: A, id: A_NOTE })).body.body, 'Private A');
  assert.equal((await request({ db, userId: B, id: B_NOTE })).body.body, 'Private B');
  assert.ok(db.calls.filter(c => c.op === 'select').every(c => c.filters.owner_id));
});

test('PUT and DELETE are atomically scoped by authenticated owner, not just prior read', async () => {
  const db = samples();
  const original = structuredClone(db.rows);
  for (const [method, body] of [
    ['PUT', { title: 'attacked', body: 'attacked' }],
    ['DELETE', null],
  ]) {
    const forbidden = await request({ db, userId: B, id: A_NOTE, method, body });
    assert.equal(forbidden.statusCode, 404);
    assert.deepEqual(forbidden.body, { error: 'NOT_FOUND' });
    assert.deepEqual(db.rows, original);
  }
  const allowed = await request({ db, userId: A, id: A_NOTE, method: 'PUT',
    body: { title: 'A edited', body: 'Only A edited' } });
  assert.equal(allowed.statusCode, 200);
  assert.equal(db.rows.find(n => n.note_uuid === A_NOTE).owner_id, A);
  assert.equal((await request({ db, userId: A, id: A_NOTE, method: 'DELETE' })).statusCode, 200);
  assert.equal((await request({ db, userId: A, id: A_NOTE })).statusCode, 404);
  assert.equal(db.rows.find(n => n.note_uuid === B_NOTE).content, 'Private B');
  for (const call of db.calls.filter(c => ['update', 'delete'].includes(c.op))) {
    assert.ok([A, B].includes(call.filters.owner_id));
    assert.equal(typeof call.filters.note_uuid, 'string');
    if (call.op === 'update') assert.deepEqual(Object.keys(call.updateData).sort(), ['content', 'title']);
  }
});

test('POST binds owner from verified identity and rejects forged owner_id on create or edit', async () => {
  const db = database([]);
  const malicious = await request({ db, userId: A, method: 'POST',
    body: { id: A_NOTE, title: 'X', body: 'Y', owner_id: B } });
  assert.equal(malicious.statusCode, 400);
  assert.deepEqual(malicious.body, { error: 'OWNER_ID_NOT_ALLOWED' });
  assert.equal(db.rows.length, 0);
  const created = await request({ db, userId: A, method: 'POST',
    body: { title: 'A new', body: 'Own notes', userId: B, role: 'admin' } });
  assert.equal(created.statusCode, 201);
  assert.match(created.body.id, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/u);
  assert.equal(db.rows[0].owner_id, A);
  const move = await request({ db, userId: A, method: 'PUT', id: created.body.id,
    body: { title: 'changed', body: 'changed', owner_id: B } });
  assert.equal(move.statusCode, 400);
  assert.equal(db.rows[0].owner_id, A);
  assert.equal(db.rows[0].title, 'A new');
});

test('no authorization, invalid identities and invalid bodies never reach notes DB', async () => {
  const db = samples();
  const originalCount = db.accessCount;
  for (const params of [
    { auth: '' },
    { auth: null },
    { userId: null },
    { userId: 'invalid-user' },
  ]) {
    const res = await request({ db, ...params });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'UNAUTHORIZED' });
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  assert.equal(db.accessCount, originalCount);
  const invalid = await request({ db, userId: A, method: 'PUT', id: A_NOTE,
    body: { title: '', body: 'x' } });
  assert.equal(invalid.statusCode, 400);
});

test('judge and student verified user IDs obey identical ownership predicates', async () => {
  const db = samples();
  const judge = await request({ db, userId: B, kind: 'judge', id: A_NOTE });
  assert.equal(judge.statusCode, 404);
  const own = await request({ db, userId: B, kind: 'judge', id: B_NOTE });
  assert.equal(own.statusCode, 200);
  const attempt = await request({ db, userId: A, kind: 'student', id: B_NOTE, method: 'DELETE' });
  assert.equal(attempt.statusCode, 404);
  assert.ok(db.rows.some(n => n.note_uuid === B_NOTE));
});

test('the stage 4 manifest keeps all API routes and original judge trust configuration', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  assert.equal(config.step, 4);
  assert.deepEqual(config.allowedRoutes, [
    'GET /api/notes', 'POST /api/notes', 'GET /api/notes/:id',
    'PUT /api/notes/:id', 'DELETE /api/notes/:id',
  ]);
  assert.equal(config.judgeIssuer, 'https://aleph-judge-production.up.railway.app/defense/judge');
  assert.equal(config.identityProvider.audience, 'authenticated');
  const loginPage = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const signupPage = await readFile(new URL('../public/signup.html', import.meta.url), 'utf8');
  const stylesheet = await readFile(new URL('../public/monster-defense.css', import.meta.url), 'utf8');
  assert.match(loginPage, /id="auth-completion"/u);
  assert.match(loginPage, /id="auth-completion-title"/u);
  assert.match(loginPage, /id="auth-email-check"/u);
  assert.match(loginPage, /getAuthCompletion\(next, returnedFromSignupEmail\)/u);
  assert.match(loginPage, /Boolean\(next\)/u);
  assert.match(stylesheet, /\.auth-completion\{/u);
  assert.match(signupPage, /가입 요청이 접수되었습니다/u);
  assert.match(signupPage, /인증 완료 상태가 아닙니다/u);
  assert.match(signupPage, /const verifiedSession = Boolean\(data\?\.session\?\.user\?\.email_confirmed_at\)/u);
  assert.match(signupPage, /result-mark.*verified/u);
  assert.match(loginPage, /id="signup" href="\/signup\.html"/u,
    'Signup button must lead to dedicated registration screen');
  assert.doesNotMatch(loginPage, /supabase\.auth\.signUp\(/u,
    'Login and account creation actions must be separate');
  assert.match(signupPage, /id="signup-form"/u);
  assert.match(signupPage, /id="signup-email"/u);
  assert.match(signupPage, /id="signup-password"/u);
  assert.match(signupPage, /id="signup-confirm"/u);
  assert.match(signupPage, /supabase\.auth\.signUp/u);
  assert.match(signupPage, /emailRedirectTo:\s*new URL\('\/',\s*window\.location\.href\)\.href/u,
    'Email confirmation must return to BYTE BACK home');
  assert.match(signupPage, /error\.status === 429/u);
  assert.match(signupPage, /비밀번호가 일치하지 않습니다/u);
  assert.match(signupPage, /인증 메일/u);
  assert.match(signupPage, /href="\/"/u,
    'Signup page must provide a route back to login');
  for(const layer of ['scene-city.svg','scene-monsters.svg','scene-shield.svg']) {
    assert.ok(signupPage.includes('/assets/'+layer), 'Signup must preserve ' + layer);
  }
  assert.match(stylesheet, /\.signup-steps\{/u);
  assert.doesNotMatch(signupPage, /sb_secret_[A-Za-z0-9_-]{12,}/u);
  const verifier = await readFile(new URL('../src/verify-login.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /createLoginVerifier/u);
  const code = await readFile(new URL('../src/notes-api.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /owner_id\.is\.null/u);
  assert.match(code, /\.eq\('owner_id', verified\.userId\)/u);
});

test('login completion labels reflect a genuinely verified email only', () => {
  assert.equal(getAuthCompletion(null), null);
  assert.equal(getAuthCompletion({}), null);
  const pending = getAuthCompletion({
    user: { email: 'pending@example.test', email_confirmed_at: null },
  }, true);
  assert.equal(pending.title, '로그인 완료!');
  assert.equal(pending.emailVerified, false);
  assert.equal(pending.emailLabel, '이메일 인증 대기');
  const verified = { user: { email: 'verified@example.test',
    email_confirmed_at: '2026-10-12T04:00:00Z' } };
  const signedIn = getAuthCompletion(verified);
  assert.equal(signedIn.title, '로그인 완료!');
  assert.equal(signedIn.emailLabel, '✓ 이메일 인증 완료');
  const emailReturn = getAuthCompletion(verified, true);
  assert.equal(emailReturn.title, '이메일 인증 완료!');
  assert.equal(emailReturn.emailVerified, true);
  assert.equal(isSignupEmailReturn('#access_token=fake-do-not-share&type=signup'), true);
  assert.equal(isSignupEmailReturn('#type=signup'), false);
  assert.equal(isSignupEmailReturn('#type=recovery&access_token=fake'), false);
  assert.equal(isSignupEmailReturn(''), false);
});
