import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/notes.js';

function responseDouble() {
  const headers = new Map();
  let status;
  let body;
  return {
    headers,
    get statusCode() { return status; },
    get body() { return body; },
    setHeader(name, value) { headers.set(name.toLowerCase(), value); return this; },
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
}

test('notes API rejects non-GET requests and never caches', async () => {
  const response = responseDouble();
  await handler({ method: 'POST' }, response);
  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.body, { error: 'METHOD_NOT_ALLOWED' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('allow'), 'GET');
});

test('missing server configuration fails closed without revealing a key', async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    const response = responseDouble();
    await handler({ method: 'GET' }, response);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { error: 'NOTES_SERVICE_NOT_CONFIGURED' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
});
