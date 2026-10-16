// Restricted Stage 12 npm run bundle checker. Unlike the live operations checker,
// this module deliberately performs NO HTTP, crypto, subprocess or filesystem I/O.
// Never describe an unexecuted check as a blocked attack or a judge pass.
// The regression suite compares these IDs/stages/expectations with live probes.
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

export function runStage12SubmissionChecks(config) {
  if (config?.step !== 12) throw new Error('Stage12-only restricted submission');
  return EXPECTATIONS.map(([attackId, expected]) => ({
    attackId, stage: CASE_STAGE[attackId], expected,
    observed: 'not_run', result: 'not_run',
  }));
}
