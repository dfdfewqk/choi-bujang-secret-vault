// Stage 12 submission: use only anonymous public HTTPS GET requests.
// No authenticated probes, mutations, recovery calls or engine simulation here.
// Response bodies from protected note endpoints are NEVER read or logged.
const EXPECTATIONS = Object.freeze([
  [
    "public_data_removed",
    "Public /data.json no longer publishes sample notes"
  ],
  [
    "anonymous_note_read_denied",
    "Anonymous notes GET is rejected without returning owner data"
  ],
  [
    "deployment_step12_manifest",
    "Public /aleph.json declares stage 12"
  ],
  [
    "anonymous_item_read_denied",
    "Anonymous note item GET must reject access"
  ],
  [
    "home_security_header",
    "Homepage must respond with HTTP 200 and nosniff"
  ],
  [
    "stage6_registered_device_allowed",
    "Approved device requests receive correct policy decision"
  ],
  [
    "stage6_unregistered_device_denied",
    "Unapproved device requests are denied"
  ],
  [
    "stage7_composite_step_up",
    "High-risk access triggers additional authentication"
  ],
  [
    "stage7_recently_verified_allow",
    "Verified legitimate high-risk access can proceed"
  ],
  [
    "stage8_unknown_route_denied",
    "Resource policy denies unknown routes"
  ],
  [
    "stage8_announcement_edit_denied",
    "Resource policy denies unauthorized announcement edits"
  ],
  [
    "stage8_notes_list_denied",
    "Resource policy denies broad notes collection GET"
  ],
  [
    "stage8_api_notes_list_denied",
    "Resource policy denies broad API notes collection GET"
  ],
  [
    "stage9_120_normal",
    "Detector handles normal read counts"
  ],
  [
    "stage9_121_burst",
    "Detector detects suspicious request bursts"
  ],
  [
    "stage9_two_subjects",
    "Detector separates activity by identity"
  ],
  [
    "stage9_slow_requests",
    "Detector distinguishes slow from rapid reads"
  ],
  [
    "stage10_anonymous_restore_denied",
    "Unauthenticated restore API access is rejected"
  ],
  [
    "stage11_anonymous_device_denied",
    "Unauthenticated device API access is rejected"
  ],
  [
    "stage12_anonymous_operations_denied",
    "Unauthenticated operations API access is rejected"
  ]
]);

// Fixed anonymous endpoints: every request must be a public read with an
// independently observed HTTP response; other expectations remain not_run.
const PUBLIC_READS = Object.freeze([
  ['public_data_removed', '/data.json'],
  ['anonymous_note_read_denied', '/api/notes'],
  ['deployment_step12_manifest', '/aleph.json'],
  ['anonymous_item_read_denied', '/api/notes/11111111-1111-4111-8111-111111111111'],
  ['home_security_header', '/'],
  ['stage10_anonymous_restore_denied', '/api/restore'],
  ['stage11_anonymous_device_denied', '/api/device'],
  ['stage12_anonymous_operations_denied', '/api/operations'],
]);


const CASE_STAGE = Object.freeze({
  public_data_removed:2,
  anonymous_note_read_denied:3,
  deployment_step12_manifest:12,
  anonymous_item_read_denied:4,
  home_security_header:2,
  stage6_registered_device_allowed:6,
  stage6_unregistered_device_denied:6,
  stage7_composite_step_up:7,
  stage7_recently_verified_allow:7,
  stage8_unknown_route_denied:8,
  stage8_announcement_edit_denied:8,
  stage8_notes_list_denied:8,
  stage8_api_notes_list_denied:8,
  stage9_120_normal:9,
  stage9_121_burst:9,
  stage9_two_subjects:9,
  stage9_slow_requests:9,
  stage10_anonymous_restore_denied:10,
  stage11_anonymous_device_denied:11,
  stage12_anonymous_operations_denied:12,
});
function publicApp(config) {
  const app = new URL(config.publicAppUrl);
  if (app.protocol !== 'https:' || !app.hostname.endsWith('.vercel.app')
      || app.username || app.password || app.port || app.search || app.hash
      || app.pathname !== '/') throw Error('Stage12 public HTTPS origin invalid');
  return app;
}
async function observe(app, attackId, path) {
  const url = new URL(path, app);
  if (url.origin !== app.origin || url.search || url.hash)
    throw Error('Invalid public probe path');
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {accept: 'application/json'},
      redirect: 'manual',
      signal: AbortSignal.timeout(4500),
      alephEvidence: {caseId: attackId, requestKey: 'read'},
    });
    // The 53-point reference uses the canonical observable format HTTP NNN
    // and reports blocked/breached separately. A status alone isn't a pass.
    let blocked = false;
    if (attackId === 'deployment_step12_manifest') {
      // This file is public. Never read response bodies from private note APIs.
      if (response.status === 200) {
        const advertised = Number(response.headers.get('content-length') ?? 0);
        if (Number.isSafeInteger(advertised) && advertised <= 4096) {
          try {
            const body = await response.text();
            if (body.length <= 4096) blocked = JSON.parse(body)?.step === 12;
          } catch { /* public manifest not validated */ }
        }
      }
    } else if (attackId === 'home_security_header') {
      blocked = response.status === 200
        && response.headers.get('x-content-type-options') === 'nosniff';
    } else {
      blocked = [401,403,404,405].includes(response.status);
    }
    return {observed: 'HTTP ' + response.status, result: blocked ? 'blocked' : 'breached'};
  } catch {
    return {observed: 'not_run', result: 'not_run'};
  }
}

export async function runStage12PublicReadOnlyChecks(config) {
  const app = publicApp(config);
  const measured = new Map();
  // Sequential GETs mirror the 53-point reference and avoid overlapping
  // evidence case registrations. No writes or authenticated probes.
  for (const [id, path] of PUBLIC_READS) {
    measured.set(id, await observe(app, id, path));
  }
  return EXPECTATIONS.map(([attackId, expected]) => ({
    attackId, stage: CASE_STAGE[attackId], expected,
    ...(measured.get(attackId) ?? {observed: 'not_run', result: 'not_run'}),
  }));
}
