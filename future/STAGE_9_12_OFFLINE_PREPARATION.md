# BYTE BACK 9~12단계 병렬 개발 브랜치 (운영 제출 아님)

**기준 브랜치:** `prep-stage9-to12-offline-20261013`. 공식 8단계 심판 제출용 `main`, `aleph.config.json.step=8`, 운영 Vercel, Supabase 메모와 RLS, 기존 XDR-01~06을 보존합니다.

- **9단계:** `src/detect.mjs`에 실제 공개된 `docs/DETECT_EVENTS.md` 계약을 구현. `npm run detect:test` 6사례와 독립 테스트 8사례를 확인합니다. 조회 GET 121건/10분/동일 subject일 때 `propose_revocation`을 반환할 뿐 실제 로그아웃은 하지 않습니다.
- **10단계:** 백업 서명·무결성·소유권 검사, 승인 후 메모리 모의 복원과 테스트를 별도 오프라인 ZIP에서 구현. 아직 공식 인터페이스는 공개되지 않아 현재 운영 DB에 적용하지 않습니다.
- **11단계:** 검증된 사용자/기기·세션 만료·메모 소유권 분리를 독립 모의 접근 앱으로 구현. 운영 인증 API는 건드리지 않습니다.
- **12단계:** 중복 경보 제거, 수동 승인, TTL 만료, 감사 로그를 오프라인 사건 작전실에 구현. 실제 방화벽·계정 회수·서버 권한 변경 없음.
- **시각화:** `BYTE_BACK_9_12_OFFLINE_COMMAND_CENTER.html`은 인터넷 없이 Chrome에서 실행하는 별도 HTML로 제공됩니다.

**원본 8단계는 공식 통과를 아직 확인하지 못했고, 10~12단계의 실제 심판 계약도 미공개입니다.** 통합 시 공식 자료와 대조한 후 개별 승인·테스트·배포해야 합니다. 이 브랜치를 `main`에 자동 병합하거나 Vercel Preview/Production으로 배포하지 마세요.

준비 브랜치 검사 명령:
```
npm run detect:test
node --test test/step9-detect.test.mjs
npm run decider:test
```
