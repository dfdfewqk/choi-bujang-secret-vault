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

function publicApp(config) {
  const app = new URL(config.publicAppUrl);
  if (app.protocol !== 'https:' || !app.hostname.endsWith('.vercel.app')
      || app.username || app.password || app.port || app.search || app.hash
      || app.pathname !== '/') throw Error('Stage12 public HTTPS origin invalid');
  return app;
}

async function observe(app, attackId, path) {
  const url = new URL(path, app);
  if (url.origin !== app.origin || url.search || url.hash) throw Error('Invalid public probe path');
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      headers: {accept: 'application/json'},
      signal: AbortSignal.timeout(4500),
      alephEvidence: {caseId: attackId, requestKey: 'read'},
    });
    // Only a public manifest may be inspected. Never read note/API response
    // bodies, including on unexpected HTTP 200.
    if (attackId === 'deployment_step12_manifest' && response.status === 200) {
      const advertised = Number(response.headers.get('content-length') ?? 0);
      if (!Number.isSafeInteger(advertised) || advertised > 4096)
        return 'HTTP 200; manifestStep=unverified';
      let step = 'unverified';
      try {
        const body = await response.text();
        if (body.length <= 4096) {
          const parsed = JSON.parse(body);
          if (Number.isInteger(parsed?.step)) step = String(parsed.step);
        }
      } catch { /* A malformed public manifest is not a successful check. */ }
      return 'HTTP 200; manifestStep=' + step;
    }
    const header = attackId === 'home_security_header'
      ? '; nosniff=' + (response.headers.get('x-content-type-options') === 'nosniff')
      : '';
    return 'HTTP ' + response.status + header;
  } catch {
    return 'not_run';
  }
}

export async function runStage12PublicReadOnlyChecks(config) {
  const app = publicApp(config);
  // Public GETs run concurrently with bounded request timeouts; no writes.
  const measured = await Promise.all(PUBLIC_READS.map(async ([id, path]) =>
    [id, await observe(app, id, path)]));
  const outcomes = new Map(measured);
  return EXPECTATIONS.map(([attackId, expected]) => ({
    attackId, expected, observed: outcomes.get(attackId) ?? 'not_run',
  }));
}
