// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2) {
    throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  }
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) {
    throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  }
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  if (config.step === 1) {
    return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
      observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
  }

  const checks = [{
    attackId: 'public_data_removed',
    expected: '비로그인 /data.json 요청에서 가상 메모를 읽을 수 없어야 함',
    observed: visible
      ? '공개 정적 파일에서 가상 메모가 여전히 읽힘 — 보호 실패'
      : `/data.json에 공개 가상 메모 확인 표시 없음 (HTTP ${response.status})`,
  }];
  try {
    const apiResponse = await fetch(new URL('/api/notes', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let count = null;
    if (apiResponse.ok) {
      const result = await apiResponse.json();
      if (result?.sampleMarker === config.sampleMarker && Array.isArray(result.notes)) {
        count = result.notes.length;
      }
    }
    checks.push({
      attackId: 'anonymous_api_read',
      expected: '2단계 공개 API가 비로그인 요청에 가상 메모 네 건을 반환하는 약점 확인',
      observed: count === 4
        ? '비로그인 API 호출에서 가상 메모 4건 읽힘 — 3단계 인증이 필요함'
        : `비로그인 API의 정상 자료 4건을 확인하지 못함 (HTTP ${apiResponse.status}, 건수 ${count ?? '미확인'})`,
    });
  } catch {
    checks.push({
      attackId: 'anonymous_api_read',
      expected: '2단계 공개 API가 비로그인 요청에 가상 메모 네 건을 반환하는 약점 확인',
      observed: '공개 API를 확인하지 못함 (네트워크 오류 또는 제한 시간 초과)',
    });
  }
  return checks;
}
