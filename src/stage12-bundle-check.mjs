// Stage 12 official submission only: intentionally no network access.
// Sandbox compatibility is more important here than local probe output.
// Live API, ownership and engine verification stay in separate application tests.
// Never report an unexecuted check as passing.
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

export async function runStage12PublicReadOnlyChecks(_config) {
  return EXPECTATIONS.map(([attackId, expected]) => ({
    attackId, expected, observed: 'not_run',
  }));
}
