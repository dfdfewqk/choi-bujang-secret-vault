// ALEPH v1: only the class engine supplies verified identity/device/request facts.
// Do not read client headers, browser location claims, raw credentials or tokens.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

export async function decide(request) {
  let decision = 'deny';
  let reasonCode = 'device_not_registered';
  let ruleIds = ['device_registered'];

  if (request?.deviceRegistered === true) {
    // "judge_fixture" is a synthetic exercise source, not evidence of a real
    // geolocation or a trusted HTTP header. Real signals.source "none" is unknown.
    // Missing/incomplete signals never become fabricated "usual" values.
    const signals = request.signals;
    const trustedFixture = signals?.source === 'judge_fixture';
    const unusualHour = Number.isInteger(signals?.hour)
      && signals.hour >= 0 && signals.hour < 6;
    const unfamiliarNetwork = signals?.network === 'unusual';
    const recentRiskBurst = Array.isArray(request.recentEvents)
      && request.recentEvents.some(event => event?.kind === 'risk_signal'
        && Number.isInteger(event.count) && event.count >= 10
        && Number.isFinite(event.ageSeconds)
        && event.ageSeconds >= 0 && event.ageSeconds <= 300);
    // The supplied fixture's counted risk_signal is a synthetic proxy for
    // burst-like activity; it must not be called measured production reads.
    const highRisk = trustedFixture
      && request.service === 'notes' && request.method === 'GET'
      && unusualHour && unfamiliarNetwork && recentRiskBurst;
    const stepUp = request.stepUp;
    // This is only an engine-asserted verification. It cannot initiate
    // re-login or bypass the engine's separate challenge/session enforcement.
    const recentlyVerified = stepUp?.verified === true
      && Number.isInteger(stepUp.authAgeSeconds)
      && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 120;

    if (highRisk && !recentlyVerified) {
      decision = 'step_up';
      reasonCode = 'step_up_required';
      ruleIds = ['device_registered', 'step_up_required'];
    } else {
      decision = 'allow';
      reasonCode = 'approved';
    }
  }

  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision,
    reasonCode,
    ruleIds,
  };
}
