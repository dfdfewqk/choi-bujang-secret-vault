// ALEPH SDP 엔진이 검증한 요청만 판정합니다. 개인키나 브라우저 기기 주장값을 저장하지 않습니다.
// 신원, 실제 기기 등록 여부 및 경로 확인은 엔진에서 먼저 수행합니다.
export const RULE_IDS = Object.freeze(['device_registered']);

export async function decide(request) {
  const registered = request?.deviceRegistered === true;
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: registered ? 'allow' : 'deny',
    reasonCode: registered ? 'approved' : 'device_not_registered',
    ruleIds: ['device_registered'],
  };
}
