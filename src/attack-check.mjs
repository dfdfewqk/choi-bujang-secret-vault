// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2 && config.step !== 3 && config.step !== 4 && config.step !== 5 && config.step !== 6 && config.step !== 7 && config.step !== 8) {
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
  if (config.step === 3 || config.step === 4 || config.step === 5 || config.step === 6 || config.step === 7 || config.step === 8) {
    const attempts = [{
      attackId: 'public_data_removed',
      expected: '/data.json does not expose any synthetic notes',
      observed: visible
        ? 'FAIL: old publicly accessible notes still present'
        : `No public sample notes at /data.json (HTTP ${response.status})`,
    }];
    const api = await fetch(new URL('/api/notes', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let result = null;
    try { result = await api.json(); } catch { /* failure is recorded below */ }
    attempts.push({
      attackId: 'anonymous_note_read_denied',
      expected: 'Unauthenticated notes list is JSON 401/403 with no note data',
      observed: ([401,403].includes(api.status) && result?.error
          && !Object.hasOwn(result, 'notes'))
        ? `Anonymous GET /api/notes denied with JSON error (HTTP ${api.status})`
        : `FAIL: unexpected anonymous notes response (HTTP ${api.status})`,
    });
    const manifest = await fetch(new URL('/aleph.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let step = null;
    try { step = (await manifest.json())?.step; } catch { /* record failure */ }
    attempts.push({
      attackId: 'deployment_step' + config.step + '_manifest',
      expected: 'Public aleph.json is accessible and declares step ' + config.step,
      observed: manifest.ok && step === config.step
        ? 'Public deployment manifest identifies step ' + config.step
        : `FAIL: manifest missing or mismatched (HTTP ${manifest.status}, step ${step})`,
    });
    if (config.step >= 4) {
      // A/B cross-owner tests require real credentials and are NOT claimed here.
      const item = await fetch(new URL('/api/notes/11111111-1111-4111-8111-111111111111', app), {
        redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      let itemJson = null;
      try { itemJson = await item.json(); } catch { /* recorded as failure */ }
      attempts.push({
        attackId: 'anonymous_item_read_denied',
        expected: 'Unauthenticated GET /api/notes/:id returns JSON 401/403, without data',
        observed: ([401, 403].includes(item.status) && itemJson?.error
            && !Object.hasOwn(itemJson, 'body') && !Object.hasOwn(itemJson, 'notes'))
          ? 'Anonymous GET /api/notes/:id denied with JSON error (HTTP ' + item.status + ')'
          : 'FAIL: unexpected anonymous item response (HTTP ' + item.status + ')',
      });
      const home = await fetch(app, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      attempts.push({
        attackId: 'home_security_header',
        expected: 'Home responds HTTP 200 with X-Content-Type-Options: nosniff',
        observed: home.status === 200 && home.headers.get('x-content-type-options') === 'nosniff'
          ? 'Home returned HTTP 200 and nosniff header'
          : 'FAIL: HTTP ' + home.status + ', security header missing or unexpected',
      });
    }
    if (config.step === 5 || config.step === 6) {
      // Never mistake a missing apikey 401 for proof that a *valid* public-key
      // client is blocked. The owner must review/apply the table-only REVOKE.
      // The judge checks the original PostgREST URL with anon key / test JWT.
      const original = config.originalApiUrl;
      let validOriginal = false;
      try {
        const url = new URL(original);
        validOriginal = url.protocol === 'https:'
          && !url.username && !url.password && !url.search && !url.hash
          && url.pathname === '/rest/v1/vault_training_notes'
          && url.hostname.endsWith('.supabase.co');
      } catch { /* invalid original API URL recorded below */ }
      attempts.push({
        attackId: 'original_data_api_config',
        expected: 'Query-free HTTPS Supabase PostgREST path points to vault_training_notes',
        observed: validOriginal
          ? 'Configured query-free original Supabase notes API; live key/JWT denial requires separate test'
          : 'FAIL: original Supabase notes API URL is invalid',
      });
      attempts.push({
        attackId: 'original_data_api_access',
        expected: 'Original Supabase notes Data API denies anon and test-account JWT direct CRUD',
        observed: 'NOT_TESTED: DB role grants revoked and simulated SELECT denied; live public-key/JWT HTTP challenge remains',
      });
    }
    if (config.step === 6 || config.step === 7 || config.step === 8) {
      // Local request fixtures only, not proof of the real class engine or judge.
      const { decide, RULE_IDS } = await import('./decider.mjs');
      const { checkDecider } = await import('../scripts/decider-test.mjs');
      const results = await checkDecider({ decide, ruleIds: RULE_IDS });
      for (const check of results) {
        const ids = {
          '등록 기기의 정상 요청': 'stage6_registered_device_allowed',
          '미등록 기기의 가상 요청': 'stage6_unregistered_device_denied',
          '복합 이상 접속': 'stage7_composite_step_up',
          '다시 확인한 복합 이상 접속': 'stage7_recently_verified_allow',
        };
        const id = ids[check.name];
        if (!id) throw new Error('Unknown fixture result');
        attempts.push({
          attackId: id,
          expected: 'Local policy decision for ' + check.name,
          observed: check.passed
            ? 'PASS: local synthetic fixture matched; not a live engine test'
            : 'FAIL: local synthetic fixture did not match',
        });
      }
      if (config.step === 7) {
        attempts.push({
          attackId: 'stage7_live_relogin_block',
          expected: 'Real engine withholds note responses until fresh re-login is verified',
          observed: 'NOT_TESTED: engine re-login and pre-verification note response not measured',
        });
      }
    }
    if(config.step===8){
      const {decide}=await import('./decider.mjs');
      const {fixtureRequests}=await import('../scripts/fixture-7.mjs');
      const {normal}=fixtureRequests();
      for(const {id,req} of [
        {id:'stage8_unknown_route_denied',req:{...normal,path:'/notes/export'}},
        {id:'stage8_announcement_edit_denied',req:{...normal,service:'announcements',
          method:'PUT',path:'/announcements/11111111-1111-4111-8111-111111111111',
          route:'PUT /announcements/:id'}},
      ]){
        const result=await decide(req);
        attempts.push({attackId:id,
          expected:'Synthetic unknown resource or announcement edit is denied',
          observed:result.decision==='deny'&&result.reasonCode==='resource_not_allowed'
            ?'PASS: synthetic request denied':'FAIL: unexpected synthetic decision'});
      }
      const canonicalNote=await decide({
        ...normal,service:'notes',method:'GET',
        path:'/api/notes/11111111-1111-4111-8111-111111111111',
        route:'GET /api/notes/:id',
      });
      attempts.push({
        attackId:'stage8_unverified_note_get_denied',
        expected:'SDP without owner proof cannot allow a specific note UUID read; API verifies actual owner separately',
        observed:canonicalNote.decision==='deny'&&canonicalNote.reasonCode==='resource_not_allowed'
          ?'PASS: local SDP denies an unverified note UUID read; authenticated API retains owner check'
          :'FAIL: SDP allowed a note UUID read without owner evidence',
      });
      attempts.push({attackId:'stage8_live_cross_owner',
        expected:'Real authenticated B cannot fetch or modify A notes',
        observed:'NOT_TESTED: live signed accounts not used; synthetic server ownership tests run separately'});
    }
    return attempts;
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
