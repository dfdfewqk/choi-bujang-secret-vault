# 17단계 정적 코드 검토 보충 자료 — 원문 연결 확인

이 문서는 **평가용 발췌**입니다. 실행용 앱이나 실제 모델 호출 성공 기록이 아닙니다.
학생 코드 및 서버·AI 원본은 개발 브랜치 `horse-stage13-to22`에서 **한 글자도 변경하지 않았으며**, 이 커밋은 원본 5개를 그대로 싣습니다. 큰 `on-client/public/app.js`만 약 250KB 소스 수집 한도를 피하려고 이 검토본에서 제외했습니다.

모든 아래 발췌는 원본 `on-client/public/app.js` (Git blob SHA `002bfdf421f0005c14bb98dcbf3d0163f4be091d`)에서 복사했습니다. 전체 파일은 원본 보존 브랜치:
https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/25c04b604cf77cb77b48ebcc7cff11f2a4519d34/on-client/public/app.js

## 1. UI의 모델 목록 점검과 취소·세대 갱신

```js
function cancelAiCheck({ reset = false } = {}) {
  ++aiConnectionGeneration;
  if (aiConnectionController) aiConnectionController.abort();
  aiConnectionController = null;
  state.aiConnection = reset ? { status: 'idle' } : safeAiFailure({ error: { code: 'CANCELLED' } });
  renderAiConnection();
}

async function checkAiConnection() {
  const gen = generation, requestGen = ++aiConnectionGeneration;
  if (aiConnectionController) aiConnectionController.abort();
  const controller = new AbortController();
  aiConnectionController = controller;
  state.aiConnection = { status: 'loading' };
  renderAiConnection();
  try {
    const result = await aiRequest('/api/ai/check', { body: {}, signal: controller.signal });
    if (gen !== generation || requestGen !== aiConnectionGeneration) return;
    const data = result.ok ? validAiCheck(result.data, result.meta) : null;
    state.aiConnection = data ? { status: 'ok', data, meta: result.meta } : safeAiFailure(result.ok ? null : result);
    renderAiConnection();
  } finally { controller.abort(); if (aiConnectionController === controller) aiConnectionController = null; }
}
```

## 2. 별도 사건 설명 요청과 유효 응답 수용

```js
async function requestExplain(event, button) {
  clearAction();
  const gen = generation;
  const slot = explainSlots.get(event.id);
  if (!slot) return;
  const requestGen = ++explanationGeneration;
  for (const active of explainControllers.values()) active.abort();
  explainControllers.clear();
  for (const previousSlot of explainSlots.values()) setChildren(previousSlot);
  const controller = new AbortController();
  explainControllers.set(event.id, controller);
  button.disabled = true;
  const safeEvent = safeEventForAi(event) ? structuredClone(event) : null;
  state.selectedExplanation = { event: safeEvent, resource: { status: 'loading' } };
  renderStudent('explanation');
  $('ai-explanation-cancel').disabled = false;
  setChildren(slot, stateBox('loading', 'AI 설명을 요청하는 중…'));
  try {
    const result = safeEvent ? await aiRequest('/api/ai/explain', { body: { eventId: event.id }, signal: controller.signal })
      : localFailure('ON_AI_INVALID_INPUT', AI_MESSAGES.ON_AI_INVALID_INPUT, UNKNOWN_META);
    // 다시 불러오기 이후이거나 기록 칸이 바뀌었으면 늦은 응답은 버린다.
    if (gen !== generation || requestGen !== explanationGeneration || explainSlots.get(event.id) !== slot) return;
    // AI 결과는 기록 목록 상태와 분리한다. 실패해도 기록은 그대로 둔다.
    if (!result.ok) {
      state.selectedExplanation.resource = safeAiFailure(result);
      setChildren(slot, stateBox('error', `AI 설명 실패: ${state.selectedExplanation.resource.error.message}`), el('p', { className: 'muted', text: '기록은 그대로 유지됩니다. AI 연결이나 응답 문제는 과제 실패로 처리되지 않습니다.' }));
      renderStudent('explanation');
      return;
    }
    const explanation = validExplanation(result.data, event);
    if (!explanation || !safeAiTime(result.meta?.checkedAt)) {
      state.selectedExplanation.resource = safeAiFailure({ error: { code: 'ON_AI_INVALID_OUTPUT' } });
      setChildren(slot, stateBox('error', 'AI 설명 확인 불가: 응답 형식이나 근거 ID가 이 기록과 맞지 않습니다.'), el('p', { className: 'muted', text: '기록은 그대로 유지됩니다.' }));
      renderStudent('explanation');
      return;
    }
    state.selectedExplanation.resource = { status: 'ok', data: explanation, meta: result.meta };
    setChildren(slot, renderExplanation(explanation, event, result.meta));
    renderStudent('explanation');
  } finally {
    if (explainControllers.get(event.id) === controller) explainControllers.delete(event.id);
    if (document.body.contains(button)) button.disabled = false;
    if (requestGen === explanationGeneration) $('ai-explanation-cancel').disabled = true;
  }
}
```

## 3. 사건 설명 취소·이전 결과 제거

```js
function cancelExplanation({ reset = false } = {}) {
  clearAction();
  ++explanationGeneration;
  for (const controller of explainControllers.values()) controller.abort();
  explainControllers.clear();
  for (const slot of explainSlots.values()) setChildren(slot);
  const event = reset ? null : state.selectedExplanation.event;
  state.selectedExplanation = { event, resource: reset ? { status: 'idle' } : safeAiFailure({ error: { code: 'CANCELLED' } }) };
  $('ai-explanation-cancel').disabled = true;
  if (!reset && event && explainSlots.has(event.id)) setChildren(explainSlots.get(event.id), stateBox('error', AI_MESSAGES.CANCELLED));
  renderStudent('explanation');
}
```

## 4. 학생 렌더러로 전달하는 입력

```js
if (kind === 'aiConnection') return { ...snapshot(state.aiConnection), checkedAt: state.aiConnection.meta?.checkedAt ?? null, explanationAccepted: false };
  if (kind === 'explanation') return structuredClone({ event: state.selectedExplanation.event, explanation: snapshot(state.selectedExplanation.resource), checkedAt: state.selectedExplanation.resource.meta?.checkedAt ?? null });
```

## 5. 이 제출 커밋 내 **완전한 원본** 파일과 호출 경로

- `student/extension.mjs`: `renderAiConnection`, `renderExplanation` (상태별 DOM 표시)
- `src/server.mjs`: `POST /api/ai/explain`에서 사건 확인 → `service.explainIncident(...)` → 설명 형식·권한 유효성 확인
- `src/ai/vault-service.mjs`: 앱 전용 권한 맥락 → `createOnAiService(...)` → `service.explainIncident(...)`
- `src/ai/service.mjs`: 권한·모델 확인 → `activeClient.chat(...)` → 응답 JSON 및 근거 ID 검사
- `vendor/clco-http.mjs`: `createClcoClient`의 `/chat/completions` 전송

**한계:** 정적 파일로 요청 경로만 확인할 수 있습니다. 실제 계정 승인, 외부 게이트 접근, 모델 응답, 공식 AI 통과는 확인하지 않았습니다. 비밀값·모델 ID를 임의로 입력하거나 유료 호출을 실행하지 않았습니다.
