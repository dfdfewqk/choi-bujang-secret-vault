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
  // Only publicly readable static routes are permitted in the submission sandbox.
  const publicPaths = new Set(['/', '/aleph.json', '/data.json']);
  const request = async (path) => {
    if (!publicPaths.has(path)) throw new Error('Protected API probes are not permitted in bundle');
    try {
      const url = new URL(path, app);
      if (url.protocol !== 'https:' || url.origin !== app.origin) return null;
      return await fetch(url, { method: 'GET', redirect: 'error' });
    } catch {
      return null;
    }
  };
  const unavailableOr = (response, message) => response ? message : 'not_run';

  const publicFile = await request('/data.json');
  append('public_data_removed',
    '/data.json must not publicly serve the historical sample notes',
    unavailableOr(publicFile, publicFile?.status === 404 || publicFile?.status === 410
      ? `GET /data.json returned HTTP ${publicFile?.status}; no public sample file`
      : `FAIL: unexpected publicly accessible /data.json (HTTP ${publicFile?.status})`));

  append('anonymous_note_read_denied',
    'Unauthenticated note collection GET denies access with a JSON error',
    'not_run'); // Protection is verified by separate authenticated API tests.

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

  append('anonymous_item_read_denied',
    'Unauthenticated note item GET must return a JSON 401/403 denial',
    'not_run'); // An actual owner-scoped check needs verified identities.

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

  // Protected API endpoints require approved identities or an explicitly
  // authorized live test. Never call them from a sandbox-only submission.
  for (const [id, expected] of [
    ['stage10_anonymous_restore_denied', 'Anonymous restore preview GET returns JSON 401'],
    ['stage11_anonymous_device_denied', 'Anonymous device status GET returns JSON 401'],
    ['stage12_anonymous_operations_denied', 'Anonymous operations GET returns JSON 401'],
  ]) append(id, expected, 'not_run');
  return rows;
}
