import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('aleph.config.json', root), 'utf8'));

test('step 2 configuration preserves real deployment and judge issuer', () => {
  assert.equal(config.step, 2);
  assert.equal(config.repoUrl, 'https://github.com/dfdfewqk/choi-bujang-secret-vault');
  assert.equal(config.publicAppUrl, 'https://choi-bujang-secret-vault-six-jet.vercel.app');
  assert.match(config.judgeIssuer, /^https:\/\//u);
});

test('no tracked public or root JSON with original sample notes', async () => {
  for (const path of ['data.json', 'public/data.json']) {
    await assert.rejects(access(new URL(path, root)));
  }
  const page = await readFile(new URL('public/index.html', root), 'utf8');
  assert.match(page, /fetch\('\/api\/notes'/u);
  assert.doesNotMatch(page, /fetch\('\/data.json'/u);
});

test('step 2 deployment identity keeps aleph.json manifest contract', () => {
  const env = {
    VERCEL_GIT_PROVIDER: 'github',
    VERCEL_GIT_REPO_OWNER: 'dfdfewqk',
    VERCEL_GIT_REPO_SLUG: 'choi-bujang-secret-vault',
    VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40),
    VERCEL_URL: 'choi-bujang-secret-vault-six-jet.vercel.app',
  };
  const identity = deploymentIdentity(env, config);
  assert.equal(identity.step, 2);
  assert.equal(identity.repoUrl, config.repoUrl);
  assert.equal(identity.sampleMarker, config.sampleMarker);
});
