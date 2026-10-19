# HORSE 17단계 AI 호출 원문 검토 — 우선 읽을 파일

**핵심:** 이번 제출은 `public/app.js`, `student/extension.mjs`, `server.mjs`, `service.mjs`, `vault-service.mjs`, `clco-http.mjs` **6개를 동시에 포함**합니다. 앞선 판정이 `vault-service.mjs`·`clco-http.mjs`를 이름만 있다고 판단했으므로 아래에 두 파일의 **실제 실행 코드**를 원문 인용했습니다. 이 문서만이 아니라 동일 커밋의 두 파일 전체도 확인해 주세요.

## 포함한 파일 및 변형 범위

- `on-client/public/app.js`: 원본 77450B → 검토용 공백·주석 축소 69634B (JS AST 구조 동일)
- `on-client/student/extension.mjs`: 전체 원문 그대로, Git blob `fe63cbb70801841a7d33e1adbd13ea28ef339fe5`
- `on-client/src/server.mjs`: 원본 73831B → 검토용 공백·주석 축소 65364B (JS AST 구조 동일)
- `on-client/src/ai/service.mjs`: 원본 38270B → 검토용 공백·주석 축소 35161B (JS AST 구조 동일)
- `on-client/src/ai/vault-service.mjs`: 전체 원문 그대로, Git blob `f2980e077c9191f94da17da3e5f71b9b86db339d`
- `on-client/vendor/clco-http.mjs`: 전체 원문 그대로, Git blob `aef2a78d36257ef996df8cd9721384519c477fc9`

**주의:** 축소된 3개 파일은 별도 소스 검토본에서만 주석·들여쓰기·공백을 정리했습니다. 실행용 원본과 학생 코드, Vault, HTTP 전송은 변경하지 않았습니다. 제공 코드 기능·권한 검증은 제거하지 않았습니다. 이 검토 브랜치 자체는 완전한 독립 실행 앱이 아닙니다.

## 실제 코드 원문 — 이름만 나열하지 않음

### 실제 사건 설명 버튼 → /api/ai/explain → 학생 응답

원본 기준 `on-client/public/app.js`의 978–1001행:

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
```

### 계정 재연결 시 기존 점검 무효화

원본 기준 `on-client/public/app.js`의 560–564행:

```js
function invalidateAppConnectView() {
  if ((aiConnect && aiConnect.state.phase !== 'idle') || state.aiConnection.status !== 'idle') appConnectInvalidated = true;
  if (aiConnect) aiConnect.reset();
  cancelAiCheck({ reset: true });
  renderAiConnect();
```

### 점검 취소·요청 세대 검사

원본 기준 `on-client/public/app.js`의 460–478행:

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
```

### 화면의 취소 버튼 실제 이벤트

원본 기준 `on-client/public/app.js`의 1338–1340행:

```js
  $('ai-check').addEventListener('click', () => checkAiConnection());
  $('ai-check-cancel').addEventListener('click', () => cancelAiCheck());
  $('ai-explanation-cancel').addEventListener('click', () => cancelExplanation());
```

### 서버가 본인 사건으로 Vault AI 서비스를 생성하고 설명을 요청

원본 기준 `on-client/src/server.mjs`의 497–504행:

```js
          const service=createVaultOnAiService({enabled:true,vault:createNativeOperationVault(nativeHost,nativeOperation),timeoutMs:remaining(),
            appAuthorization:nativeConfiguration.fetchImpl?{fetchImpl:nativeConfiguration.fetchImpl}:{}});
          const options=Object.freeze({signal:lifetime.signal,
            expectedScope:Object.freeze({subjectId:identity.subjectId,projectId:identity.projectId,appId:'aleph-on',audience:'on-client'}),
            expectedContext:Object.freeze({alephUserId:identity.alephUserId,siteId:identity.siteId,identityVersion:identity.identityVersion}),
            beforeDispatch:recheck,beforePublish:recheck});
          const incident={incidentId:event.id,evidence:event.evidence.map(row=>({id:row.id,summary:row.text})),rules:event.rules.map(row=>({id:row.id,description:row.text})),currentState:event.state,supportedActions:event.supportedActions};
          const raw=await bounded(()=>service.explainIncident(incident,options));
```

### 실제 Vault 자격 로드·AI 서비스 호출 — 핵심 원문

원본 기준 `on-client/src/ai/vault-service.mjs`의 137–151행:

```js
      const pins=mapping(options),incident=input === undefined ? undefined : structuredClone(input);
      alive();
      const loaded=await vault.load({expectedContext:pins.vaultContext},{signal:controller.signal});
      alive();
      const {value:v,context}=credential(loaded,pins);
      alive();
      const service=createOnAiService({env:{ON_AI_BASE_URL:v.baseUrl,ON_AI_APP_KEY:v.token,ON_AI_MODEL:model},model,
        timeoutMs:Math.max(1,deadline-Date.now()),transportFactory,allowLoopbackHttp:authConfig.allowLoopbackHttp === true,
        appAuthorization:{fetchImpl:authConfig.fetchImpl ?? globalThis.fetch,maxResponseBytes:authConfig.maxResponseBytes ?? 16384}});
      const serviceOptions={signal:controller.signal,expectedScope:pins.scope,expectedContext:context};
      if(guarded){serviceOptions.beforeDispatch=options.beforeDispatch;serviceOptions.beforePublish=options.beforePublish;}
      const result=await (method==='models' ? service.checkConnection(serviceOptions)
        : method==='learner-support' ? service.explainLearningSupport(incident,observation,serviceOptions)
          : service.explainIncident(incident,serviceOptions));
      alive();
```

### 설명 전용 권한·모델 채팅 요청·응답 검증

원본 기준 `on-client/src/ai/service.mjs`의 364–375행:

```js
          };
          checkModel(authorization,true);
          const activeClient=await transport();alive(signal);guard(authorization,signal);
          if(!activeClient||typeof activeClient!=='object'||types.isProxy(activeClient))throw own('ON_AI_TRANSPORT_PENDING');
          const method=Object.getOwnPropertyDescriptor(activeClient,'chat');
          if(!method||!Object.hasOwn(method,'value')||typeof method.value!=='function'||types.isProxy(method.value))throw own('ON_AI_TRANSPORT_PENDING');
          const body={model,stream:false,messages:[{role:'system',content:systemPrompt},{role:'user',content:JSON.stringify(incident)}]};
          const dispatch=await refresh(captured.beforeDispatch);alive(signal);sameAuthority(dispatch);
          const response=await Reflect.apply(method.value,activeClient,[body,{signal}]);alive(signal);sameAuthority(dispatch);
          let parsed;try{parsed=JSON.parse(incidentContent(response));}catch{throw own('ON_AI_INVALID_OUTPUT');}
          const explanation=validateOutput(parsed,incident,secrets);
          const current=await refresh(captured.beforePublish);alive(signal);sameAuthority(dispatch);sameAuthority(current);
```

### 실제 HTTP /chat/completions 요청 — 핵심 원문

원본 기준 `on-client/vendor/clco-http.mjs`의 114–125행:

```js
    async listModels(options) {
      const result = await request('/models', null, options);
      if (result?.object !== 'list' || !Array.isArray(result.data) || result.data.some(row => typeof row?.id !== 'string' || !row.id)) throw fail('WB_CLCO_INVALID_RESPONSE', 200);
      return result.data.map(row => ({ id: row.id }));
    },
    async chat(body, options = {}) {
      if (!body || typeof body.model !== 'string' || !body.model || !Array.isArray(body.messages) || !body.messages.length || (body.stream !== undefined && typeof body.stream !== 'boolean')) throw fail('WB_CLCO_INVALID_REQUEST');
      if (body.stream && typeof options.readStream !== 'function') throw fail('WB_CLCO_STREAM_READER_REQUIRED');
      const result = await request('/chat/completions', body, options);
      if (!body.stream && (!Array.isArray(result?.choices) || !result.choices.length)) throw fail('WB_CLCO_INVALID_RESPONSE', 200);
      return result;
    },
```

## 확인한 범위와 남은 조건

- 로컬 모의 서버에서 권한·모델 호출·차단 8개 경계 시험 PASS, JavaScript 구문 검사 PASS. **실제 운영 계정 모델 호출 증거는 아닙니다.**
- `ai_model_called`: 사용자 기록 버튼 → `/api/ai/explain` → 서버 → Vault → `ai.explain` → HTTP `/chat/completions`의 코드 경로가 존재합니다. **실제 운영 계정·SDP·모델 응답 수용 및 공식 9/9은 미확인**입니다.
- `ai_generation_reset`: `invalidateAppConnectView` → `cancelAiCheck({reset:true})` → `aiConnectionGeneration` 비교를 원문으로 확인하세요.
- `ai_timeout_cancel`: UI의 AbortController, 세대 비교, 실제 취소 버튼 이벤트와 Vault/서비스 시간 제한을 구별해 확인하세요.
- 변경하지 않은 완전한 실행용 앱: https://github.com/dfdfewqk/choi-bujang-secret-vault/tree/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client
