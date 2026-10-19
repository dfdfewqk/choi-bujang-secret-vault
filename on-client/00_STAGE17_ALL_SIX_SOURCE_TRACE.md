# HORSE 17: 제출 원문 6종 호출·취소 인덱스

이 커밋에는 **제공 원본 여섯 파일을 모두 변경 없이 그대로 넣었습니다.** 이전 판정의 누락 후보인 `public/app.js`, `src/ai/vault-service.mjs`, `vendor/clco-http.mjs` 원문 전체를 반드시 함께 검토해 주세요. 이 글 자체는 실행·운영 호출 성공 증빙이 아니라 원문 위치 안내입니다.

원문 6개: `on-client/public/app.js` · `on-client/student/extension.mjs` · `on-client/src/server.mjs` · `on-client/src/ai/service.mjs` · `on-client/src/ai/vault-service.mjs` · `on-client/vendor/clco-http.mjs`.

## 1. 제공 UI: 실제 요청·세대·취소·재연결 (`public/app.js`)

보안 기록의 사건별 버튼 `L958`, 실제 POST `L995-997`, 결과 검증·학생 표시 `L998-1016`. 아래는 정확한 원문 일부입니다.

```js
958:         onclick: (e) => requestExplain(event, e.currentTarget),
995:   try {
996:     const result = safeEvent ? await aiRequest('/api/ai/explain', { body: { eventId: event.id }, signal: controller.signal })
997:       : localFailure('ON_AI_INVALID_INPUT', AI_MESSAGES.ON_AI_INVALID_INPUT, UNKNOWN_META);
1000:     // AI 결과는 기록 목록 상태와 분리한다. 실패해도 기록은 그대로 둔다.
1015:     setChildren(slot, renderExplanation(explanation, event, result.meta));
```

AI 연결 점검 취소 `L460-465`, 늦은 응답 무효화 `L469-481`, 계정 변경 시 idle 초기화 `L560-565`, native invalidation 연결 `L606`, 설명 취소 `L1024-1034`, 취소 버튼 이벤트 `L1339-1340`.

```js
460: function cancelAiCheck({ reset = false } = {}) {
461:   ++aiConnectionGeneration;
462:   if (aiConnectionController) aiConnectionController.abort();
463:   aiConnectionController = null;
464:   state.aiConnection = reset ? { status: 'idle' } : safeAiFailure({ error: { code: 'CANCELLED' } });
477:     if (gen !== generation || requestGen !== aiConnectionGeneration) return;
560: function invalidateAppConnectView() {
562:   if (aiConnect) aiConnect.reset();
563:   cancelAiCheck({ reset: true });
606:     nativeLogin = aiConnectModule.createNativeLoginController({ onChange: () => renderNativeLogin(), onInvalidate: () => invalidateAppConnectView() });
1024: function cancelExplanation({ reset = false } = {}) {
1026:   ++explanationGeneration;
1027:   for (const controller of explainControllers.values()) controller.abort();
1339:   $('ai-check-cancel').addEventListener('click', () => cancelAiCheck());
1340:   $('ai-explanation-cancel').addEventListener('click', () => cancelExplanation());
```

## 2. 실제 AI 호출 원문 체인

서버 `src/server.mjs:L466-525` → Vault `src/ai/vault-service.mjs:L137-150` → 서비스 `src/ai/service.mjs:L340-376` (`ai.explain` 권한 확인) → 전송 `vendor/clco-http.mjs:L119-124` (`/chat/completions`). 각 파일 전체가 이 커밋에 포함됩니다.

```js
143:       const service=createOnAiService({env:{ON_AI_BASE_URL:v.baseUrl,ON_AI_APP_KEY:v.token,ON_AI_MODEL:model},model,
148:       const result=await (method==='models' ? service.checkConnection(serviceOptions)
149:         : method==='learner-support' ? service.explainLearningSupport(incident,observation,serviceOptions)
150:           : service.explainIncident(incident,serviceOptions));
119:     async chat(body, options = {}) {
122:       const result = await request('/chat/completions', body, options);
```

## 3. 판정 구분

- `ai_model_called`: UI의 사건별 설명 버튼부터 HTTP 모델 요청까지 경로는 소스로 검토 가능. **실제 운영 계정의 유효한 ai.explain·SDP 승인 및 운영 모델 응답은 미확인**.
- `ai_generation_reset`: `public/app.js`의 `invalidateAppConnectView` → `cancelAiCheck({reset:true})`과 세대 증가, 학생 DOM 새 표시.
- `ai_timeout_cancel`: `AbortController.abort()`, `aiConnectionGeneration` 세대 확인, 버튼 이벤트 연결을 원문에서 확인 가능.
- 실행 가능한 전체 앱은 `horse-safe-cleanup-docs-20261019`. **이 브랜치는 17단계 소스 검토 전용**이며 앱 전체 실행본이 아닙니다.
