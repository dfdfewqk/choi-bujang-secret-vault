// Stage 12 bundle-only probe. It deliberately does NOT load fixture helpers,
// invoke class-engine callbacks, mutate accounts/notes, or call protected APIs
// with made-up credentials. Separate CI tests retain the local fixtures.
export async function runStage12PublicReadOnlyChecks(config, app = new URL(config.publicAppUrl)) {
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('잘못된 공개 HTTPS 주소입니다.');
  }
  const rows = [];
  const append = (attackId, expected, observed) => rows.push({ attackId, expected, observed });
  const request = async (path) => {
    try {
      const url = new URL(path, app);
      if (url.protocol !== 'https:' || url.origin !== app.origin) return null;
      return await fetch(url, { method: 'GET', redirect: 'error' });
    } catch {
      return null;
    }
  };
  const rejectedJson = async (response) => {
    if (!response || ![401, 403].includes(response.status)) return null;
    try { return await response.json(); } catch { return null; }
  };
  const unavailableOr = (response, message) => response ? message : 'not_run';

  const publicFile = await request('/data.json');
  append('public_data_removed',
    '/data.json must not publicly serve the historical sample notes',
    unavailableOr(publicFile, publicFile?.status === 404 || publicFile?.status === 410
      ? `GET /data.json returned HTTP ${publicFile?.status}; no public sample file`
      : `FAIL: unexpected publicly accessible /data.json (HTTP ${publicFile?.status})`));

  const listing = await request('/api/notes');
  const listingJson = await rejectedJson(listing);
  append('anonymous_note_read_denied',
    'Unauthenticated note collection GET denies access with a JSON error',
    unavailableOr(listing, [401, 403].includes(listing?.status)
      && typeof listingJson?.error === 'string' && !Object.hasOwn(listingJson, 'notes')
      ? `Anonymous notes GET denied (HTTP ${listing?.status})`
      : `FAIL: unexpected anonymous note collection response (HTTP ${listing?.status})`));

  const manifest = await request('/aleph.json');
  let declaredStep = null;
  if (manifest?.ok) {
    try { declaredStep = (await manifest.json())?.step; } catch { /* no claim */ }
  }
  append('deployment_step12_manifest',
    'Public deployment declares stage 12 in /aleph.json',
    unavailableOr(manifest, manifest?.status === 200 && declaredStep === config.step
      ? 'Public deployment declares stage 12'
      : `FAIL: deployment manifest does not confirm stage 12 (HTTP ${manifest?.status})`));

  const item = await request('/api/notes/11111111-1111-4111-8111-111111111111');
  const itemJson = await rejectedJson(item);
  append('anonymous_item_read_denied',
    'Unauthenticated note item GET must return a JSON 401/403 denial',
    unavailableOr(item, [401, 403].includes(item?.status)
      && typeof itemJson?.error === 'string' && !Object.hasOwn(itemJson, 'body')
      && !Object.hasOwn(itemJson, 'notes')
      ? `Anonymous item GET denied (HTTP ${item?.status})`
      : `FAIL: unexpected anonymous item response (HTTP ${item?.status})`));

  const home = await request('/');
  append('home_security_header', 'Homepage uses HTTP 200 and nosniff',
    unavailableOr(home, home?.status === 200 && home.headers.get('x-content-type-options') === 'nosniff'
      ? 'Homepage HTTP 200; nosniff present'
      : `FAIL: homepage/header mismatch (HTTP ${home?.status})`));

  // These checks need signed engine/owner context or separate local fixtures.
  // They are NOT executed here and must not be reported as real defenses.
  for (const [id, expected] of [
    ['stage6_registered_device_allowed', 'Registered device is permitted by the engine'],
    ['stage6_unregistered_device_denied', 'Unregistered device is denied by the engine'],
    ['stage7_composite_step_up', 'Engine requests additional authentication for high risk'],
    ['stage7_recently_verified_allow', 'Freshly verified legitimate request is allowed'],
    ['stage8_unknown_route_denied', 'Engine denies an out-of-zone route'],
    ['stage8_announcement_edit_denied', 'Unverified role cannot modify announcements'],
    ['stage8_notes_list_denied', 'Engine denies broad GET /notes collection'],
    ['stage8_api_notes_list_denied', 'Engine denies broad GET /api/notes collection'],
    ['stage9_120_normal', 'Detector observes 120 GET requests without revocation'],
    ['stage9_121_burst', 'Detector proposes revocation after 121 rapid GET requests'],
    ['stage9_two_subjects', 'Detector separates different subjects'],
    ['stage9_slow_requests', 'Detector does not flag slow GET requests'],
  ]) append(id, expected, 'not_run');

  for (const [id, path, expected] of [
    ['stage10_anonymous_restore_denied', '/api/restore', 'Anonymous restore preview GET returns JSON 401'],
    ['stage11_anonymous_device_denied', '/api/device', 'Anonymous device status GET returns JSON 401'],
    ['stage12_anonymous_operations_denied', '/api/operations', 'Anonymous operations GET returns JSON 401'],
  ]) {
    const result = await request(path);
    const json = await rejectedJson(result);
    append(id, expected, unavailableOr(result, result?.status === 401 && json?.error === 'UNAUTHORIZED'
      ? path === '/api/device' ? 'PASS: anonymous device status denied' : `Anonymous ${path} GET denied (HTTP 401)`
      : `FAIL: unexpected anonymous ${path} response (HTTP ${result?.status})`));
  }
  return rows;
}
