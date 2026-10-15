// Interpret one actual API response, never infer success from missing headers.
export function classifyAuditHeader(headers) {
 const value=headers?.get?.('X-Audit-Recorded');
 if(value==='true')return {state:'verified',message:'이번 API 응답 한 건의 감사 저장은 확인되었습니다. 엔진 전체 상태를 보증하지 않습니다.'};
 if(value==='false')return {state:'failed',message:'경고: API 감사 기록 저장 실패. 감시 기록 공백을 확인하세요.'};
 return {state:'unknown',message:'감사 기록 저장 상태 미확인. 감시가 정상이라고 판단하지 않습니다.'};
}
