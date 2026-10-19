# 17단계 AI 호출·계정 연결 검토 자료 (원본 발췌)

이 문서는 원래 제공 UI와 서버 파일에서 **그대로 복사한 코드의 발췌**입니다. 기존 제공 파일과 학생 코드는 수정하지 않았습니다. 원래 파일을 대체하는 실행용 서버 코드는 아니며, 실제 모델 응답 성공 기록도 아닙니다.

## 확인 순서와 포함된 원본 파일

1. **전체 원본** `on-client/public/app.js` (Git blob `002bfdf421f0005c14bb98dcbf3d0163f4be091d`): `requestExplain(event, button)`은 `event.id`를 `/api/ai/explain`으로 보내고, 성공 시 `state.selectedExplanation.resource`와 `renderStudent('explanation')`을 갱신합니다. `checkAiConnection`, `cancelAiCheck`, `invalidateAppConnectView`, `cancelExplanation`, `studentData`, `renderStudent`와 버튼 핸들러도 이 원본에 포함됩니다.
2. **서버 원본 일부** `on-client/src/server.mjs`의 466–545행 (Git blob `42774051fa29614e28f4f823db41fe33942166ed`): `POST /api/ai/explain` 사건 검증 → 앱 권한 재확인 → `createVaultOnAiService` 또는 `mappedService`의 `explainIncident` 호출 → 실제 설명 응답 검증·수용. 아래에 원문을 그대로 제공합니다.
3. **전체 원본** `on-client/src/ai/vault-service.mjs` (Git blob `033afb449305c093f4b5b032dd12ebee679a8a27`): `createOnAiService`를 호출해 권한 맥락으로 `explainIncident`를 위임합니다.
4. **전체 원본** `on-client/src/ai/service.mjs` (Git blob `4a78e9303b54dcf73d11172d2abe1fab5b274456`): 모델 목록 점검과 별도로 `explainIncident`에서 `activeClient.chat(...)`을 호출하고, 모델 응답을 검증합니다.
5. **전체 원본** `on-client/vendor/clco-http.mjs` (Git blob `aef2a78d36257ef996df8cd9721384519c477fc9`): 실제 게이트 `/chat/completions` 전송 코드입니다.
6. **전체 원본** `on-client/student/extension.mjs` (Git blob `fe63cbb70801841a7d33e1adbd13ea28ef339fe5`): AI 연결 표시와 사건 설명 성공·실패 표시 코드. 단계 13~16 코드도 유지합니다.
7. **계정 연결 UI 원본 일부** `on-client/public/ai-connect.mjs` (Git blob `0ca658697a94a0f50c9a31a83093c9e592205996`): 원문 471–521행과 605–640행을 함께 제공해, 계정 변경·취소·세대 무효화 근거를 확인할 수 있게 합니다.

전체 서버 파일 원문은 기존 개발 커밋에 수정 없이 있습니다:
https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/25c04b604cf77cb77b48ebcc7cff11f2a4519d34/on-client/src/server.mjs

전체 AI 연결 UI 원문은 기존 개발 커밋에 수정 없이 있습니다:
https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/25c04b604cf77cb77b48ebcc7cff11f2a4519d34/on-client/public/ai-connect.mjs

## A. `src/server.mjs` 466–545행 (원문 그대로)

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
          const capture=(value,keys)=>{
            if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)throw engineError('SERVICE_UNAVAILABLE','');
            const descriptors=Object.getOwnPropertyDescriptors(value);
            if(Reflect.ownKeys(descriptors).length!==keys.length||keys.some(key=>!Object.hasOwn(descriptors,key)||!Object.hasOwn(descriptors[key],'value')))throw engineError('SERVICE_UNAVAILABLE','');
            return Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
          };
          if(raw===null||typeof raw!=='object'||types.isProxy(raw))throw engineError('SERVICE_UNAVAILABLE','');
          const ok=Object.getOwnPropertyDescriptor(raw,'ok');if(!ok||!Object.hasOwn(ok,'value')||typeof ok.value!=='boolean')throw engineError('SERVICE_UNAVAILABLE','');
          if(ok.value===false){const output=capture(raw,['ok','error','help']),error=capture(output.error,['code','message']);
            const code=Object.hasOwn(aiErrorMessages,error.code)?error.code:'WB_CLCO_REQUEST_FAILED';assertAlive();send(503,{ok:false,error:{code,message:aiErrorMessages[code],retryable:true}});return;}
          const output=capture(raw,['ok','transportChecked','audienceAuthorization','explanation','authorizationValidUntilMs','help']);
          if(output.transportChecked!==true||output.audienceAuthorization!=='verified'||!Number.isSafeInteger(output.authorizationValidUntilMs)||output.authorizationValidUntilMs<=Date.now())throw engineError('ON_AI_PROVISIONING_PENDING','');
          aiHelp({audienceAuthorization:'verified',help:capture(output.help,['component','code','appCredentialsConfigured','provisioning','automaticRetries','workbenchRequiredAtRuntime'])});
          const explanation=assertExplanation(capture(output.explanation,['summary','evidenceIds','proposals','requiresHumanConfirmation','executed']),event,[]);
          const body=JSON.stringify({ok:true,data:{explanation},meta:meta()});
          assertAlive();let current;
          try{current=assertSdpIncidentOperation(sdpHostEngine,sourceOperation);assertNativeHostOperation(nativeHost,nativeOperation);}catch{throw engineError('ON_AI_PROVISIONING_PENDING','');}
          sameIdentity(current);
          if(current.eventHash!==initial.eventHash||current.validUntilMs<=Date.now()||output.authorizationValidUntilMs<=Date.now())throw engineError('ON_AI_PROVISIONING_PENDING','');
          assertAlive();res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-on-request-id':requestId});res.end(body);return;
        }finally{closeSdpIncidentOperation(sourceOperation);closeNativeHostOperation(nativeOperation);}
      }
      if(req.method==='POST'&&url.pathname==='/api/ai/explain'){
        const {eventId}=await bounded(()=>jsonBody(req,['eventId']));
        const identity=assertData('identity',await call('readIdentity'));
        const expectedScope=Object.freeze({subjectId:identity.user.id,projectId:engine.projectId,appId:'aleph-on',audience:'on-client'});
        if(mode==='connected'&&(!id(expectedScope.projectId)||identity.session.status!=='active'))throw engineError('SUBJECT_SCOPE_UNVERIFIED','');
        const rawEvents=await call('readEvents',expectedScope);
        if(mode==='connected'&&(!Array.isArray(rawEvents)||rawEvents.some(event=>event.subjectId!==expectedScope.subjectId||event.projectId!==expectedScope.projectId)))throw engineError('SUBJECT_SCOPE_UNVERIFIED','');
        const events=assertData('events',rawEvents);const event=events.find(row=>row.id===eventId);
        if(!event)throw engineError('EVENT_NOT_FOUND','본인 기록에서 사건을 찾을 수 없습니다.',404);
        const after=assertData('identity',await call('readIdentity'));
        if(after.user.id!==identity.user.id||after.session.id!==identity.session.id||after.session.status!=='active'||engine.projectId!==expectedScope.projectId)throw engineError('SUBJECT_SCOPE_UNVERIFIED','');
        if(lifetime.signal.aborted||res.destroyed)throw engineError('REQUEST_CANCELLED','');
        const source=Object.freeze({sourceSubjectId:identity.user.id,projectId:expectedScope.projectId,sessionId:identity.session.id});
        const binding=await readMapping(source);
        const output=await bounded(()=>mappedService().explainIncident({incidentId:event.id,evidence:event.evidence.map(e=>({id:e.id,summary:e.text})),rules:event.rules.map(r=>({id:r.id,description:r.text})),currentState:event.state,supportedActions:event.supportedActions},authOptions(binding)));
        await finishMapping(source,binding);
        if(!output?.ok){send(503,{ok:false,error:aiFailure(output)});return;}
        send(200,{ok:true,data:{explanation:assertExplanation(output.explanation,event,aiSecrets)}});return;
      }
```

## B. `public/ai-connect.mjs` 471–521행 (원문 그대로)

```js
export function createNativeLoginController({ transport = createNativeFetchTransport(), onChange = () => {}, onInvalidate = () => {},
  clock = () => Date.now(), monotonic = () => performance.now(), actionMs = NATIVE_ACTION_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t) } = {}) {
  let generation = 0, controller = null, expiryTimer = null, monoExpiry = null;
  let state = Object.freeze({ phase: 'idle', expiresAtMs: null, approvalUrl: null, confirmation: null, reason: null, cancelUnconfirmed: false, expiredFrom: null });
  const set = (next) => { state = Object.freeze({ ...state, ...next }); onChange(state); };
  const now = () => { const t = clock(); return Number.isSafeInteger(t) ? t : NaN; };
  const notify = (reason) => { try { onInvalidate(reason); } catch { /* 화면 쪽 실패가 상태기를 멈추지 않게 한다 */ } };
  const stopExpiry = () => { if (expiryTimer !== null) clearTimer(expiryTimer); expiryTimer = null; };
  const abortRequest = () => { controller?.abort(); controller = null; };
  const live = (ctx) => ctx.g === generation;
  const expired = () => state.expiresAtMs !== null && (!(now() < state.expiresAtMs) || (monoExpiry !== null && monotonic() >= monoExpiry));

  // 기한이 지나면 화면 표시만 지운다. 네트워크는 부르지 않는다. 타이머가 일찍 돌면 남은 시간만큼 다시 건다.
  function markExpired(g) {
    if (g !== generation) return;
    const lostConnection = state.phase === 'connected';
    stopExpiry();
    monoExpiry = null;
    set({ phase: 'expired', expiredFrom: state.phase, expiresAtMs: null, approvalUrl: null, confirmation: null, reason: 'NATIVE_LOGIN_EXPIRED_LOCAL' });
    if (lostConnection) notify('lost');
  }
  function scheduleExpiry(g) {
    stopExpiry();
    if (state.expiresAtMs === null) return;
    const wait = Math.min(state.expiresAtMs - now(), monoExpiry - monotonic());
    if (!(wait > 0)) { markExpired(g); return; }
    expiryTimer = setTimer(() => {
      expiryTimer = null;
      if (g !== generation) return;
      if (expired()) markExpired(g); else scheduleExpiry(g);
    }, Math.min(Math.ceil(wait) + 20, 2147483647));
  }
  function accept(data, g, extra = {}) {
    monoExpiry = data.expiresAtMs === null ? null : monotonic() + (data.expiresAtMs - now());
    const phase = data.state === 'unknown' || data.state === 'starting' ? 'unknown' : data.state;
    const reason = data.state === 'unknown' ? 'NATIVE_LOGIN_SERVER_UNKNOWN' : data.state === 'starting' ? 'NATIVE_LOGIN_SERVER_STARTING' : null;
    set({ phase, expiresAtMs: data.expiresAtMs, approvalUrl: data.approvalUrl, confirmation: data.confirmation, reason, cancelUnconfirmed: false, expiredFrom: null, ...extra });
    scheduleExpiry(g);
  }
  function failTo(ctx, code, phase, extra = {}) {
    if (!live(ctx)) return;
    stopExpiry();
    monoExpiry = null;
    set({ phase, expiresAtMs: null, approvalUrl: null, confirmation: null, reason: nativeReason(code), expiredFrom: null, ...extra });
  }
  // 새 세대를 열고 이전 요청을 끊는다. 늦게 온 이전 응답은 세대가 달라 버려진다.
  function begin(phase, extra = {}) {
    const g = ++generation;
    abortRequest();
    stopExpiry();
```

## C. `public/ai-connect.mjs` 605–640행 (원문 그대로)

```js
  // 사용자 취소: 새 세대로 진행 중 요청과 늦은 응답을 버리고 서버에 실제 cancel {} 를 보낸다.
  // starting 중에도 보낸다(서버가 ticket·verifier 를 보관한다). 응답 유실·시간 초과는 취소 성공이 아니다.
  async function cancel() {
    if (!nativeCanCancel(state.phase)) return state;
    notify('cancel');
    const ctx = begin('cancelling', { expiresAtMs: null, approvalUrl: null, confirmation: null, expiredFrom: null });
    monoExpiry = null;
    try {
      const result = await call(ctx, 'cancel');
      if (!live(ctx)) return state;
      if (!result.ok) { failTo(ctx, result.error.code, 'unknown', { cancelUnconfirmed: true }); return state; }
      const data = validNativeData(result.data, now());
      if (data?.state === 'cancelled' && timely(ctx)) { accept(data, ctx.g); return state; }
      failTo(ctx, data?.state === 'cancelled' ? 'NATIVE_LOGIN_CLIENT_TIMEOUT' : 'NATIVE_LOGIN_RESPONSE_INVALID', 'unknown', { cancelUnconfirmed: true });
      return state;
    } finally { end(ctx); }
  }

  /** 계정 전환·pagehide: 화면 진행과 이 화면의 요청만 끝낸다. 서버 취소를 보내거나 주장하지 않는다. */
  function reset() {
    const quiet = ['idle', 'disconnected', 'cancelled', 'error'].includes(state.phase);
    ++generation;
    abortRequest();
    stopExpiry();
    monoExpiry = null;
    set({ phase: quiet ? 'idle' : 'unknown', expiresAtMs: null, approvalUrl: null, confirmation: null,
      reason: quiet ? null : 'NATIVE_LOGIN_LOCAL_RESET', cancelUnconfirmed: false, expiredFrom: null });
  }

  /** 비밀 없는 도움정보. 확인 번호·승인 링크·기한·학생 ID 는 넣지 않는다. */
  function helpInfo() {
    return {
      component: 'alekov-native-login',
      phase: state.phase,
      reason: state.reason,
      cancelUnconfirmed: state.cancelUnconfirmed,
```

## 검증 범위의 한계

여기에 든 원문은 **코드상의 요청 경로와 제공 버튼·세대 무효화 설계**를 설명합니다. 실제 앱 계정 승인 여부, 운영 AI 게이트 모델의 유효한 응답, 공식 과제 판정 결과는 이 문서가 인증하지 않습니다. 앱 실행에 필요한 다른 원본 파일은 삭제하지 않았으며 전체 개발 브랜치에서 보존합니다. 원문 검토를 위해 서버나 제공 UI의 실제 코드를 축약·덮어쓰지 않았습니다.
