import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/notes.js';

function responseDouble() {
  const headers = new Map();
  let status, body;
  return {
    headers,
    get statusCode() { return status; },
    get body() { return body; },
    setHeader(name, value) { headers.set(name.toLowerCase(), value); return this; },
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
}

test('unsupported method is always rejected as JSON without keys', async () => {
  const response = responseDouble();
  await handler({ method: 'PATCH' }, response);
  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.body, { error: 'METHOD_NOT_ALLOWED' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('anonymous GET and POST return JSON 401 and no notes', async () => {
  for (const method of ['GET','POST']) {
    const response = responseDouble();
    await handler({ method }, response);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'UNAUTHORIZED' });
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  }
});
