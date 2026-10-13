import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

const fresh = (request, override = {}) => ({ ...request, ...override });

test('Stage 6 registered device rule remains, and response schema is unchanged', async () => {
  assert.ok(RULE_IDS.includes('device_registered') && RULE_IDS.includes('step_up_required'));
  const { normal } = fixtureRequests();
  for (const deviceRegistered of [false, undefined, null, 'true']) {
    const result = await decide(fresh(normal, { deviceRegistered }));
    assert.equal(result.decision, 'deny');
    assert.equal(result.reasonCode, 'device_not_registered');
    assert.deepEqual(result.ruleIds, ['device_registered']);
    assert.deepEqual(Object.keys(result).sort(),
      ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
    assert.equal(result.requestId, normal.requestId);
  }
});

test('Stage 7 normal and combined-risk requests differ', async () => {
  const { normal, suspicious } = fixtureRequests();
  const allowed = await decide(normal);
  assert.equal(allowed.decision, 'allow');
  assert.equal(allowed.reasonCode, 'approved');
  const challenged = await decide(suspicious);
  assert.equal(challenged.decision, 'step_up');
  assert.equal(challenged.reasonCode, 'step_up_required');
  assert.ok(challenged.ruleIds.includes('device_registered'));
  assert.ok(challenged.ruleIds.includes('step_up_required'));
});

test('Region alone and either single anomaly never permanently deny', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide(fresh(normal, { signals: {
    ...normal.signals, region: 'foreign',
  }}))).decision, 'allow');
  assert.equal((await decide(fresh(suspicious, { signals: {
    ...suspicious.signals, network: 'usual',
  }}))).decision, 'allow');
  assert.equal((await decide(fresh(suspicious, { signals: {
    ...suspicious.signals, hour: 14,
  }}))).decision, 'allow');
});

test('Unknown source, forged client header and missing fields cannot establish trusted anomalies', async () => {
  const { suspicious } = fixtureRequests();
  for (const signals of [
    undefined,
    { ...suspicious.signals, source: 'none' },
    { ...suspicious.signals, source: 'client_header' },
    { ...suspicious.signals, source: 'judge_fixture', network: undefined },
    { ...suspicious.signals, source: 'judge_fixture', hour: undefined },
  ]) {
    const result = await decide(fresh(suspicious, {
      signals,
      clientHeaders: { 'X-Network': 'unusual', 'X-Region': 'foreign' },
      geo: { region: 'foreign' },
    }));
    // No assumption of a 'normal' location or network; only trusted
    // engine device registration is evaluated when evidence is absent.
    assert.equal(result.decision, 'allow');
  }
  const { normal } = fixtureRequests();
  assert.equal((await decide(fresh(normal, {
    recentEvents: [{ kind: 'risk_signal', ageSeconds: 1, count: 500 }],
    signals: { ...normal.signals, source: 'none', hour: 3, network: 'unusual' },
    'X-Verified-Source': 'judge_fixture',
  }))).decision, 'allow');
});

test('High-risk fixture requires recent engine-verified step-up, not a raw flag', async () => {
  const { suspicious } = fixtureRequests();
  for (const stepUp of [
    undefined, { verified: false, authAgeSeconds: null },
    { verified: true, authAgeSeconds: null },
    { verified: true, authAgeSeconds: 121 },
    { verified: true, authAgeSeconds: -1 },
    { verified: 'true', authAgeSeconds: 60 },
  ]) {
    const response = await decide(fresh(suspicious, { stepUp }));
    assert.equal(response.decision, 'step_up');
    assert.equal(response.reasonCode, 'step_up_required');
  }
  const confirmed = await decide(fresh(suspicious, {
    stepUp: { verified: true, authAgeSeconds: 60 },
  }));
  assert.equal(confirmed.decision, 'allow');
  assert.equal(confirmed.reasonCode, 'approved');
});

test('Stale events or invented reading counts cannot independently trigger step-up', async () => {
  const { suspicious } = fixtureRequests();
  for (const recentEvents of [
    undefined, [],
    [{ kind: 'risk_signal', ageSeconds: 301, count: 20 }],
    [{ kind: 'risk_signal', ageSeconds: 30, count: 9 }],
    [{ kind: 'other', ageSeconds: 30, count: 20 }],
  ]) {
    const response = await decide(fresh(suspicious, { recentEvents }));
    assert.equal(response.decision, 'allow');
  }
});
