# 17단계 AI 사건 설명 — 실제 소스 호출 경로

기준: `6ebfeb42d34e5015b1d7ab947de4e691a4cb455f`. 아래는 **현재 제출 원본 파일**에서 경로와 행번호를 지정해 가져온 코드 그대로입니다. 원본 수정·실행·운영 계정 인증이 아닙니다.

- 모델 목록 점검: `student/extension.mjs:renderAiConnection`은 `/api/ai/check` 응답의 `test`/`verified`와 모델 수만 표시합니다.
- 사건 설명: `public/app.js`의 `AI 설명 요청` 버튼이 `/api/ai/explain`을 부르고, 제공 서버→vault→AI 서비스→CLCO HTTP로 이어집니다. `student/extension.mjs:renderExplanation`은 그 결과를 해당 `event.id`에 표시합니다.
- **실제 계정의 승인·모델 응답 성공은 확인하지 않았습니다.** 아래 코드가 존재한다는 사실만으로 `ai_model_called`의 실행 성취를 인증하지 않습니다.

## 보안 사건 ID 전달
`on-client/public/app.js:995-997` · SHA `002bfdf421f0005c14bb98dcbf3d0163f4be091d`
```js
  try {
    const result = safeEvent ? await aiRequest('/api/ai/explain', { body: { eventId: event.id }, signal: controller.signal })
      : localFailure('ON_AI_INVALID_INPUT', AI_MESSAGES.ON_AI_INVALID_INPUT, UNKNOWN_META);
```

## 서버가 사건 근거를 구성하고 서비스 호출
`on-client/src/server.mjs:503-504` · SHA `42774051fa29614e28f4f823db41fe33942166ed`
```js
          const incident={incidentId:event.id,evidence:event.evidence.map(row=>({id:row.id,summary:row.text})),rules:event.rules.map(row=>({id:row.id,description:row.text})),currentState:event.state,supportedActions:event.supportedActions};
          const raw=await bounded(()=>service.explainIncident(incident,options));
```

## vault에서 AI 서비스 설명 호출
`on-client/src/ai/vault-service.mjs:123-126` · SHA `033afb449305c093f4b5b032dd12ebee679a8a27`
```js
      if(guarded){serviceOptions.beforeDispatch=options.beforeDispatch;serviceOptions.beforePublish=options.beforePublish;}
      const result=await (method==='models' ? service.checkConnection(serviceOptions)
        : method==='learner-support' ? service.explainLearningSupport(incident,observation,serviceOptions)
          : service.explainIncident(incident,serviceOptions));
```

## AI 서비스가 chat 모델 응답 요청·검증
`on-client/src/ai/service.mjs:370-374` · SHA `4a78e9303b54dcf73d11172d2abe1fab5b274456`
```js
          const body={model,stream:false,messages:[{role:'system',content:systemPrompt},{role:'user',content:JSON.stringify(incident)}]};
          const dispatch=await refresh(captured.beforeDispatch);alive(signal);sameAuthority(dispatch);
          const response=await Reflect.apply(method.value,activeClient,[body,{signal}]);alive(signal);sameAuthority(dispatch);
          let parsed;try{parsed=JSON.parse(incidentContent(response));}catch{throw own('ON_AI_INVALID_OUTPUT');}
          const explanation=validateOutput(parsed,incident,secrets);
```

## HTTP /chat/completions 전송
`on-client/vendor/clco-http.mjs:119-124` · SHA `aef2a78d36257ef996df8cd9721384519c477fc9`
```js
    async chat(body, options = {}) {
      if (!body || typeof body.model !== 'string' || !body.model || !Array.isArray(body.messages) || !body.messages.length || (body.stream !== undefined && typeof body.stream !== 'boolean')) throw fail('WB_CLCO_INVALID_REQUEST');
      if (body.stream && typeof options.readStream !== 'function') throw fail('WB_CLCO_STREAM_READER_REQUIRED');
      const result = await request('/chat/completions', body, options);
      if (!body.stream && (!Array.isArray(result?.choices) || !result.choices.length)) throw fail('WB_CLCO_INVALID_RESPONSE', 200);
      return result;
```

두 파일 `on-client/src/ai/vault-service.mjs`, `on-client/vendor/clco-http.mjs`는 제출 커밋에 원본 전체가 존재합니다. `/chat/completions` 실행은 **유효한 학생 계정·앱 이용 권한·승인 모델**이 있을 때만 허용됩니다. 이 커밋은 용량 제한에 맞춘 코드 검토본이며, 완전한 실행용 앱은 `horse-stage13-to22`에 보존되어 있습니다.
