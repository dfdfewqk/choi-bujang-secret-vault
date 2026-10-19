# HORSE Stage17 ai_model_called: 실제 Vault 및 HTTP 원본 코드 검토

**이 파일은 실제 모델을 호출했다는 증거가 아니라, GitHub에서 해당 구현을 읽을 수 있도록 만든 소스 안내입니다.** 공식 피드백의 'vault-service.mjs와 clco-http.mjs가 이름만 제공됨' 문제에 대응합니다. 실제 학생 계정/운영 모델 호출은 여전히 미확인입니다.

기준 원본: https://github.com/dfdfewqk/choi-bujang-secret-vault/tree/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client

## 이 제출 커밋에 원문 전체가 들어 있는 파일 (변경 없이 복제)

| 원본 링크 | 크기(B) | 원본 Git blob SHA |
| --- | ---: | --- |
| [on-client/student/extension.mjs](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/student/extension.mjs) | 31939 | `fe63cbb70801841a7d33e1adbd13ea28ef339fe5` |
| [on-client/src/server.mjs](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/src/server.mjs) | 73831 | `42774051fa29614e28f4f823db41fe33942166ed` |
| [on-client/src/ai/service.mjs](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/src/ai/service.mjs) | 38270 | `4a78e9303b54dcf73d11172d2abe1fab5b274456` |
| [on-client/src/ai/vault-service.mjs](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/src/ai/vault-service.mjs) | 13743 | `f2980e077c9191f94da17da3e5f71b9b86db339d` |
| [on-client/vendor/clco-http.mjs](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/vendor/clco-http.mjs) | 9068 | `aef2a78d36257ef996df8cd9721384519c477fc9` |

`on-client/src/ai/vault-service.mjs`와 `on-client/vendor/clco-http.mjs`는 **실제 원문 전체가 GitHub blob으로 존재하며 이 검토 커밋에 포함**됩니다. `server.mjs` → `vault-service.mjs` → `service.mjs` → `clco-http.mjs`로 이어지는 사건 설명 호출 경로는 아래 원문에서도 볼 수 있습니다.

## 전체 UI 원문은 실행용 브랜치에 보존

이 검토본은 AI 구현 코드를 충분히 읽을 공간을 만들기 위해 큰 `public/app.js` 전체(77450바이트)를 **중복 복사하지 않습니다**. 제공 UI의 원본 파일은 변경하지 않고 [GitHub 원문에서 직접 확인](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/public/app.js)할 수 있습니다. Git blob SHA `002bfdf421f0005c14bb98dcbf3d0163f4be091d`.

## 각 호출 단계의 기존 코드 원문(직접 발췌, 변경 없음)

### 연결 점검 취소·세대 무효화

[원본 on-client/public/app.js L460–L465](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/public/app.js#L460-L465)

```js
function cancelAiCheck({ reset = false } = {}) {
  ++aiConnectionGeneration;
  if (aiConnectionController) aiConnectionController.abort();
  aiConnectionController = null;
  state.aiConnection = reset ? { status: 'idle' } : safeAiFailure({ error: { code: 'CANCELLED' } });
  renderAiConnection();
```

### 계정 변경 때 기존 연결 점검 초기화

[원본 on-client/public/app.js L560–L565](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/public/app.js#L560-L565)

```js
function invalidateAppConnectView() {
  if ((aiConnect && aiConnect.state.phase !== 'idle') || state.aiConnection.status !== 'idle') appConnectInvalidated = true;
  if (aiConnect) aiConnect.reset();
  cancelAiCheck({ reset: true });
  renderAiConnect();
}
```

### 사건별 /api/ai/explain 실제 요청

[원본 on-client/public/app.js L990–L1007](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/public/app.js#L990-L1007)

```js
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
```

### SDP+Native 신원 확인 및 Vault AI 서비스 생성

[원본 on-client/src/server.mjs L466–L504](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/src/server.mjs#L466-L504)

```js
      if(req.method==='POST'&&url.pathname==='/api/ai/explain'&&nativeHost){
        if(!Number.isSafeInteger(aiTimeoutMs)||aiTimeoutMs<=0||aiTimeoutMs>120000){
          send(503,{ok:false,error:{code:'WB_CLCO_INVALID_LIMIT',message:aiErrorMessages.WB_CLCO_INVALID_LIMIT,retryable:false}});return;
        }
        const routeLimit=Math.min(aiTimeoutMs,requestTimeoutMs);
        supportDeadline={wall:requestStartedAt.wall+routeLimit,monotonic:requestStartedAt.monotonic+routeLimit};
        const remaining=()=>{assertAlive();return Math.max(1,Math.floor(Math.min(supportDeadline.wall-Date.now(),supportDeadline.monotonic-performance.now())));};
        supportTimer=setTimeout(()=>{requestTimedOut=true;lifetime.abort();},remaining());
        let nativeOperation=null,sourceOperation=null;
        const sourceCall=async work=>{try{return await bounded(work);}catch(error){assertAlive();if(['REQUEST_TIMEOUT','REQUEST_CANCELLED'].includes(error?.code))throw error;throw engineError('ON_AI_PROVISIONING_PENDING','');}};
        try{
          if(Number(req.headers['content-length']??0)>8192)throw engineError('REQUEST_TOO_LARGE','',413);
          const input=await bounded(()=>jsonBody(req,['eventId']));
          if(!isOwnedSdpHostEngine(sdpHostEngine))throw engineError('ON_AI_PROVISIONING_PENDING','');
          nativeOperation=await sourceCall(signal=>openNativeHostOperation(nativeHost,{signal,timeoutMs:remaining()}));
          const readHost=async signal=>{if(signal.aborted)throw engineError('REQUEST_CANCELLED','');const current=await sourceCall(()=>readNativeHostOperation(nativeHost,nativeOperation));assertAlive();if(signal.aborted)throw engineError('REQUEST_CANCELLED','');return current;};
          const identity=await readHost(lifetime.signal);
          sourceOperation=await sourceCall(signal=>openSdpIncidentOperation(sdpHostEngine,input,{signal,timeoutMs:remaining()}));
          const initial=assertSdpIncidentOperation(sdpHostEngine,sourceOperation),event=initial.event;
          const sameIdentity=source=>{if(Object.keys(identity).some(key=>source.binding.ai[key]!==identity[key]))throw engineError('ON_AI_PROVISIONING_PENDING','');};
          sameIdentity(initial);
          const recheck=async({signal})=>{
            if(signal.aborted)throw engineError('REQUEST_CANCELLED','');
            const current=await sourceCall(()=>readSdpIncidentOperation(sdpHostEngine,sourceOperation,{signal}));
            const native=await readHost(signal);
            if(Object.keys(identity).some(key=>native[key]!==identity[key])||current.eventHash!==initial.eventHash)throw engineError('ON_AI_PROVISIONING_PENDING','');
            sameIdentity(current);assertAlive();
            try{assertSdpIncidentOperation(sdpHostEngine,sourceOperation);assertNativeHostOperation(nativeHost,nativeOperation);}catch{throw engineError('ON_AI_PROVISIONING_PENDING','');}
            if(current.validUntilMs<=Date.now())throw engineError('ON_AI_PROVISIONING_PENDING','');
            if(signal.aborted)throw engineError('REQUEST_CANCELLED','');assertAlive();
          };
          const service=createVaultOnAiService({enabled:true,vault:createNativeOperationVault(nativeHost,nativeOperation),timeoutMs:remaining(),
            appAuthorization:nativeConfiguration.fetchImpl?{fetchImpl:nativeConfiguration.fetchImpl}:{}});
          const options=Object.freeze({signal:lifetime.signal,
            expectedScope:Object.freeze({subjectId:identity.subjectId,projectId:identity.projectId,appId:'aleph-on',audience:'on-client'}),
            expectedContext:Object.freeze({alephUserId:identity.alephUserId,siteId:identity.siteId,identityVersion:identity.identityVersion}),
            beforeDispatch:recheck,beforePublish:recheck});
          const incident={incidentId:event.id,evidence:event.evidence.map(row=>({id:row.id,summary:row.text})),rules:event.rules.map(row=>({id:row.id,description:row.text})),currentState:event.state,supportedActions:event.supportedActions};
          const raw=await bounded(()=>service.explainIncident(incident,options));
```

### Native Vault 로드 후 실제 서비스 explainIncident 위임

[원본 on-client/src/ai/vault-service.mjs L135–L150](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/src/ai/vault-service.mjs#L135-L150)

```js
    const work=async()=>{
      // Snapshot the trusted mapping and incident before any callback can yield.
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
```

### ai.explain 승인 확인 후 채팅 모델 호출 및 응답 검증

[원본 on-client/src/ai/service.mjs L350–L378](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/src/ai/service.mjs#L350-L378)

```js
        return operation(captured,async(signal,expectedScope,expectedContext)=>{
          const authorization=await authorize('explain','ai.explain',signal,expectedScope,expectedContext);alive(signal);
          if(authorization.mode!=='verified')throw own('ON_AI_PROVISIONING_PENDING');
          const before=structuredClone(authorization.proof);
          const pins=['appId','audience','subjectId','alephUserId','siteId','projectId','credentialId','grantId','grantVersion','identityVersion','policyVersion','accessPolicyId','purpose','requiredCapability','revoked','credentialFingerprint','modelPolicyVersion'];
          const sameAuthority=current=>{
            if(current.mode!=='verified')throw own('ON_AI_PROVISIONING_PENDING');
            guard(authorization,signal);guard(current,signal);checkModel(current,true);
            if(pins.some(key=>current.proof[key]!==before[key])||['capabilities','allowedModels'].some(key=>JSON.stringify(current.proof[key])!==JSON.stringify(before[key])))throw own('ON_AI_PROVISIONING_PENDING');
          };
          const refresh=async callback=>{
            const current=await authorize('explain','ai.explain',signal,expectedScope,expectedContext);alive(signal);sameAuthority(current);
            try{await callback({signal});}catch{alive(signal);throw own('ON_AI_PROVISIONING_PENDING');}
            alive(signal);sameAuthority(current);return current;
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
          const authorizationValidUntilMs=Math.floor(Math.min(Date.parse(before.validUntil),Date.parse(dispatch.proof.validUntil),Date.parse(current.proof.validUntil),deadline.wall,Date.now()+Math.max(0,deadline.monotonic-performance.now())));
          if(!Number.isSafeInteger(authorizationValidUntilMs)||authorizationValidUntilMs<=Date.now())throw own('ON_AI_PROVISIONING_PENDING');
          return {ok:true,transportChecked:true,audienceAuthorization:'verified',explanation,authorizationValidUntilMs,help:help('ON_AI_APP_AUTHORIZATION_VERIFIED','verified')};
```

### /models와 별도의 HTTP /chat/completions 전송

[원본 on-client/vendor/clco-http.mjs L114–L124](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/f3e2226541f9085d9586c824e8e2708ce86d03dd/on-client/vendor/clco-http.mjs#L114-L124)

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
```

## 공식 평가상 구분

- 원문 전체 확인 가능: `student/extension.mjs`, `src/server.mjs`, `src/ai/service.mjs`, `src/ai/vault-service.mjs`, `vendor/clco-http.mjs`.
- 브라우저 UI 연결 원문 발췌와 원본 URL: `public/app.js`.
- `ai.models` 모델 목록 확인과 `ai.explain` 사건 설명은 다른 권한 및 다른 HTTP 요청입니다.
- `ai_model_called`에 필요한 실제 운영 계정·SDP ai-binding·모델 승인·외부 모델 성공 응답은 **이 소스 검토 자료로 확인할 수 없습니다**. 모델 목록 조회나 모의 호출을 운영 호출이라고 표시하지 않습니다.
- **검토 전용 소스이므로 이 브랜치에서 실행하지 마세요.** 전체 실제 실행용 앱은 위 원본 커밋에 보존됩니다.
