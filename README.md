# BYTE BACK · 보너스 XDR-02 저장점 (웹 주입 공격 탐지)

> **작업 범위:** 기존 1~5단계 메모·Supabase Auth·ZTNA 판정기와 보너스 XDR-01은 유지합니다. `xdr/fixtures/web-injection.json`의 가상 경보 26건에만 새 독립형 판단 모듈을 추가합니다. 보너스 작업이라 `aleph.config.json` 단계 값과 실 배포 주소는 변경하지 않습니다.

## 현재 기능과 ZTNA 규칙 위치 (5줄)

1. `src/decider.mjs`에서 ZTNA 기본 규칙 `RULE_IDS=['starter.deny']`를 직접 읽어 `decide(request)`로 판단합니다.
2. 기존 ZTNA 계약은 `docs/DECIDER_REQUEST.md`이며 XDR-02는 기존 판단 함수나 판정기 규칙을 대체하지 않습니다.
3. `xdr/web-injection/decide.mjs`는 `patterns.json` 패턴을 내장해 단독·오프라인으로 T1190 웹 경보를 `block / alert / record`로 분류합니다.
4. `respond.mjs`는 명확한 반복 공격만 15분짜리 출발 주소별 임시 거부 후보로 만들고, `xdr/alerts.log`에 비밀값 없는 경고를 남깁니다.
5. 검증된 출발 주소를 제공하는 신뢰된 호출자가 연결기에 접속을 맡길 때만 임시 규칙을 검사하며, 그 밖의 요청은 기존 ZTNA 판단기로 전달합니다.

## 실행 방법

```bash
npm ci
node xdr/web-injection/read-alerts.mjs
node --test test/xdr-run.test.mjs test/xdr-brute-force.test.mjs test/xdr-web-injection.test.mjs
npm run xdr:run -- web-injection
```

- 원본 경보는 **26건**, 읽기 모듈은 경보마다 시각·출발 주소·계정·경보 수준·설명 **5개 필드**만 출력합니다. 요청 URL, 계정 토큰 및 원본 상세 경보는 출력하지 않습니다.
- `patterns.json`은 [MITRE ATT&CK T1190](https://attack.mitre.org/techniques/T1190/)을 기반으로 반복 SQL 입력, 스크립트 삽입, 경로 이탈·명령 구분자, 단발 모호 입력 네 패턴을 정의합니다.
- `decide.mjs`는 파일·패키지·네트워크 사용 없이 경보만 분류하고, 확신도 0.85 이상이면 차단 후보, 0.5 이상이면 경고, 나머지는 기록합니다.
- `respond.mjs`는 중복 출발지 주소를 하나의 차단 규칙으로 묶고, 정상 사용 기록이 같은 주소에 있다면 자동 차단을 보류합니다. 차단 만료 시각과 `wi-..` 증거 경보 ID를 포함합니다.
- `scripts/xdr-run.mjs`은 기존 `brute-force` 동작을 유지하면서 `web-injection` 모듈에만 선택적으로 `respond.mjs`를 연결합니다.
- `result.json`은 시험용 판정 결과일 뿐 실제 운영 Wazuh·ZTNA 시스템에 차단 규칙을 등록했다는 뜻은 아닙니다.
- 저장점 생성과 결과 파일 커밋은 GitHub Actions `Bonus XDR-02 web injection check and savepoint`에서 두 번 재실행한 뒤 합니다.

---

# BYTE BACK · 보너스 XDR-01 저장점 (무차별 로그인 시도 탐지)

> **작업 범위:** 1~5단계 자료실·Supabase DB·로그인 화면·기존 ZTNA 기본 판정 규칙을 보존하고, `xdr/brute-force/`에 Wazuh 모양의 **가상** 로그인 경보 방어 모듈만 추가합니다. 이번 보너스는 별도 단계이므로 `aleph.config.json`의 `step=5`는 바꾸지 않습니다.

## 현재 ZTNA 판정기와 이번 보너스의 연결 (5줄)

1. `src/decider.mjs`의 `RULE_IDS=['starter.deny']`와 `decide(request)`가 기본 ZTNA 정책을 판단하며, 기존 구현은 기본 거부입니다.
2. ZTNA의 실제 검증된 요청·응답 계약은 `docs/DECIDER_REQUEST.md`에 있고, 이번 보너스에서는 해당 파일과 판정기 코드를 바꾸지 않습니다.
3. `xdr/brute-force/decide.mjs`는 인터넷·파일·패키지 없이 시험 경보 하나만 받아 `block/alert/record`와 0~1 확신도를 반환합니다.
4. `xdr/brute-force/respond.mjs`는 `block` 후보만 만료 시간이 있는 임시 거부 규칙으로 만들고 `createZtnaDenyGate` 연결기를 제공합니다.
5. **연결기는 신뢰할 수 있는 호출자가 검증된 접속 출발지 주소를 제공해야 작동하며**, 실제 반 엔진에 자동 등록되는 것으로 주장하지 않습니다.

## 보너스 XDR-01 실행

- `xdr/fixtures/brute-force.json`: 수정하지 않는 28건의 Wazuh 형태 가상 경보
- `xdr/brute-force/read-alerts.mjs`: 경보마다 시각·IP·가상 계정·규칙 수준·설명 **5개 필드만** 읽고 출력 시 비밀값처럼 보이는 문자열을 제거
- `xdr/brute-force/patterns.json`: [MITRE ATT&CK T1110](https://attack.mitre.org/techniques/T1110/) 및 T1110.001/.003에 기반한 네 가지 패턴과 일련의 조건·한 줄 근거
- `xdr/brute-force/decide.mjs`: 단일 파일의 정적 패턴을 사용하여 0.85 이상 자동 차단 후보, 0.5 이상 경고, 나머지는 기록으로 분류
- `xdr/brute-force/respond.mjs`: 같은 출발지에 정상 성공 기록이 있을 때 자동 차단을 보류하고, 확실한 공격 출발지의 **15분짜리 거부 후보 규칙** 및 경보 ID를 생성합니다. `xdr/alerts.log`와 임시 규칙 캐시는 Git에서 제외합니다.
- `scripts/xdr-run.mjs`: 기존 일반 XDR 시험은 그대로 두되 `brute-force` 모듈이 있을 때만 로컬 응답기를 호출합니다. `xdr/brute-force/result.json`만 공개 Git에 저장합니다.

```bash
npm ci
node xdr/brute-force/read-alerts.mjs
node --test test/xdr-run.test.mjs test/xdr-brute-force.test.mjs
npm run xdr:run -- brute-force
```

위 명령의 `result.json`은 수업용 경보에 대한 **오프라인 모의 판정**입니다. 실제 Wazuh 서비스, 인터넷 차단 장치, 운영 ZTNA 정책 배포나 심판 점수를 확인한 것으로 해석하지 않습니다. 최종 커밋·실행 결과는 GitHub Actions의 `Bonus XDR-01 brute-force check and savepoint`에서도 확인할 수 있습니다.

---

# BYTE BACK · 5단계 저장점 (자료 요청을 서버 한곳으로 모읍니다)

> **작업 상태 (2026-10-12):** 4단계는 이미 `main`에 병합돼 [운영 사이트](https://choi-bujang-secret-vault-six-jet.vercel.app/)로 배포됐고 운영 익명 API 검증도 통과했습니다. 직전 `main` 커밋은 `5cad12e1dea4359c0b9965724ae77e1c4a23e69e`(4단계 Artifacts 90일 보관 설정)입니다. 기존 README가 **4단계 운영 배포 대기**라고 적은 것은 최신 기록과 달라 여기서 바로잡았습니다. 현재 5단계는 `stage5-server-only` 검토 브랜치에 있으며 운영 사이트를 아직 5단계로 전환하지 않았습니다. **메모 테이블의 직접 권한 회수 SQL은 사용자 승인 후 적용 완료**했습니다. `PUBLIC`·`anon`·`authenticated`의 직접 CRUD는 차단됐고 `service_role`은 유지됩니다. 다른 테이블·기존 메모 5건은 변경하지 않았습니다.

> **5단계 저장점 최종 검증:** GitHub Actions의 2·3·4·5단계 자동 테스트가 모두 통과했고, `npm run bundle`을 실제 실행하여 5단계 JSON을 생성했습니다. Vercel **미리보기** `https://choi-bujang-secret-vault-git-stage5-server-only-dfdfewqk.vercel.app/`는 READY 상태입니다. **운영 사이트의 코드는 여전히 4단계**이지만 DB의 학습용 메모 테이블 권한은 5단계 기준으로 변경 완료했습니다. DB 역할 모의 검사에서 직접 SELECT 거부를 확인했으며, 심판이 사용하는 실제 공개 키·시험 계정 JWT 기반 HTTP 검사는 별도 확인이 필요합니다.

## 현재 작동하는 기능 (5줄)

1. Supabase Auth로 회원가입·이메일 인증·로그인·로그아웃·세션 복원을 합니다.
2. 브라우저의 메모 GET/POST/PUT/DELETE는 Vercel `/api/notes`·`/api/notes/:id`만 호출하고 Supabase 데이터 API를 직접 호출하지 않습니다.
3. 서버 함수는 인증된 사용자 ID와 `owner_id`가 일치하는 메모만 조회·추가·수정·삭제합니다.
4. 계정별 메모 소유권과 A↔B 상대 메모 직접 GET 404 차단을 유지합니다. 과거 A 4건/B 1건이었지만, 사용자가 실제 CRUD 테스트에서 메모를 추가·삭제한 후 현재 A 3건/B 1건입니다.
5. 기존 도시·괴물·보호막 애니메이션과 `X-Content-Type-Options: nosniff` 응답 헤더를 유지합니다.

## 5단계에서 확인한 사실과 변경

- **제작 1:** `public/index.html`, `public/access-check.html`, `public/signup.html` 검사 결과 메모 자료에 대한 Supabase 직접 호출은 **없음**. 따라서 브라우저 파일과 Auth 기능은 **변경하지 않았습니다**.
- **제작 2 DB 적용 완료 (2026-10-12):** 승인된 `public.vault_training_notes` 한 테이블에만 `PUBLIC`·`anon`·`authenticated`의 모든 직접 권한을 회수했습니다. `anon`과 `authenticated`의 SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER는 전부 false, `service_role`의 권한은 모두 유지, RLS ON·정책 4개 유지입니다.
- **실제로 적용한 SQL:** 사용자 승인 후 `supabase/step5_revoke_direct_notes_review.sql`을 Supabase 마이그레이션 `byteback_step5_revoke_direct_notes_privileges`로 적용했습니다. 메모 데이터 변경 및 INSERT/DELETE는 없었습니다. 이 파일은 적용 당시의 검토본으로 유지합니다. 다른 다이어리 테이블, 서버 환경 변수 및 Auth 설정은 변경하지 않았습니다.
- **적용 전후 검사 통과:** `supabase/step5_verify_permissions.sql`과 DB 역할 모의 조회를 통해 인증·비인증 역할의 직접 SELECT 차단을 검증했습니다. 서버 전용 역할은 기존 5건을 정상 조회했습니다. A=4, B=1, 미지정=0, 제목·내용·메모 식별자에 대한 사전·사후 지문이 동일합니다.
- **브라우저 실제 사용 후 DB 재조회:** 사용자가 5단계 메모 추가·수정·삭제를 직접 확인했습니다. 이후 확인한 현재 소유자별 건수는 **A 3건, B 1건**이며 A의 기존 `포트폴리오` 메모가 없고 새 메모 제목은 `훈련 행정 자`로 기록됐습니다. 사용자 메모를 자동 복원/변경하지 않았습니다. 이는 5단계 보안 정책 문제가 아니라 실제 자료 상태이므로, 이전 단계의 A 4/B 1 결과를 현재 건수로 오인하지 않습니다.
- **실제 원본 API HTTPS 공개 키 검사:** 5단계 CI에서 브라우저에 포함된 공개 `apikey`로 Supabase PostgREST 원본 GET와 존재하지 않는 UUID에 대한 PATCH를 실행했고 **양쪽 모두 HTTP 401**을 확인했습니다. 사용자 로그인 JWT를 넣은 직접 HTTPS 테스트는 별도 미실행이며, SQL 역할 검사로는 authenticated 직접 SELECT 권한 없음이 확인됐습니다.
- **원본 자료 API:** `aleph.config.json` `originalApiUrl`은 `https://bcwzllejypavwgsfqfbm.supabase.co/rest/v1/vault_training_notes` (HTTPS, 쿼리 없음)입니다. `step=5`, `allowedRoutes` 5종, 심판/학생 발급자 설정을 보존합니다.
- **브라우저의 공개 Supabase Auth 키:** 로그인/가입을 위해 유지합니다. 가점 항목인 공개 키 완전 제거는 로그인 흐름의 위험이 커 이번 저장점에서 **시도하지 않았습니다**. 서버 전용 키는 브라우저에 없습니다.
- **검증 수준:** A의 서버 함수 CRUD는 기존 Stage 3/4 모의 API 자동 시험으로 확인한 상태입니다. 실제 DB 역할에서 `anon`/`authenticated` 직접 조회 거부, `service_role` 기존 메모 5건 조회 성공을 별도로 확인했습니다. 실계정 A의 POST/PUT/DELETE 및 공개 키·실제 JWT를 포함한 PostgREST 직접 HTTPS 호출은 이번 작업에서 실행했다고 주장하지 않습니다. 양방향 A/B GET 404와 비로그인 Vercel API 차단은 4단계에서 확인했습니다.
- **남은 일:** 브라우저에서 실계정 A 정상 CRUD → 실제 공개 키/시험 JWT를 사용한 원본 Supabase API 직접 거부(심판 포함) 확인 → 5단계 운영 반영 승인·배포 → 운영 주소 기준 최종 `npm run bundle` 재실행/제출. DB 권한 회수와 역할 검증은 완료했고, 직접 HTTP 검사는 여전히 `NOT_TESTED`로 표시합니다.

## 다시 실행하는 방법

- 로컬에서 `npm ci`, `node --test test/step3-api.test.mjs test/step4-api.test.mjs test/step5-api.test.mjs`, `npm run build -- --local`로 회귀 시험할 수 있습니다.
- 제출 묶음은 **GitHub에서 커밋된 클린 워크트리** 기준으로 `bundle-notes.json`(Git 제외)에 설명·미완료 사유를 적고 `npm run bundle`을 실행해 `artifacts/submission.json`을 생성합니다. 브랜치 CI도 이를 실행합니다.
- 운영 주소는 별도 승인 없이 변경하지 않습니다. 사용자 승인된 DB 권한 회수는 2026-10-12에 이미 적용했으며 직접 HTTP 및 실제 계정 브라우저 검사는 남아 있습니다.

---

## 4단계 기록 (과거 이력)

> **4단계 완료 (2026-10-12):** 기존 A 메모 4건·B 메모 1건을 보존하고, RLS 정책 4개·서버 소유자 검사를 적용했습니다. 양방향 실제 A/B 상대 메모 GET 404, GitHub 테스트, Vercel 4단계 운영 배포 및 `stage4-live` 자동 검사가 통과했습니다. 아래 기록은 4단계 개발 당시 작성된 이력이며, 5단계의 현재 상태는 상단을 따릅니다.


## 이번 브랜치의 기능 (5줄)

1. 기존 Supabase Auth 이메일·비밀번호 로그인/가입/로그아웃/세션 복원 및 그림 레이어 애니메이션은 그대로 유지합니다.
2. `src/verify-login.mjs` 계약을 유지하고, 로그인 토큰에서 **서버가 검증한 userId**만 사용합니다.
3. 목록 GET은 `owner_id = userId` 필터, 개별 GET·PUT·DELETE는 `note_uuid`와 `owner_id` 동시 조건으로 제한합니다.
4. 메모 POST는 인증된 소유자로 저장하고, PUT은 제목/본문만 수정하며 요청 본문 `owner_id`를 거부합니다.
5. 사용자 승인으로 DB 소유자 지정과 RLS 정책 적용이 끝났습니다. 3단계 운영 주소와 다른 Supabase 테이블은 변경하지 않았습니다.

## 사이트에서 직접 가입할 수 있도록 설정하기

- 로그인 화면의 `학습용 계정 만들기`는 `/signup.html`로 이동합니다. 이메일·비밀번호·비밀번호 확인을 별도 페이지에서 입력하고, 제출 시 Supabase Auth `signUp`을 호출합니다. 가입 후 인증 메일 안내와 로그인 복귀 링크를 제공합니다. 기존 로그인·자료실 화면은 유지합니다.
- 확인 메일의 반환 주소는 프런트엔드에서 `emailRedirectTo: new URL('/', window.location.href).href`로 지정합니다. Supabase Auth URL Configuration의 Redirect URLs에 실제 가입 사이트 URL을 등록해야 합니다. 운영 URL: `https://choi-bujang-secret-vault-six-jet.vercel.app/**`. 미리보기 도메인을 이용한 가입은 그 주소도 추가로 허용해야 합니다.
- **과거 발송 차단 원인:** Supabase 기본 SMTP에서 `/signup` HTTP 429 및 `over_email_send_rate_limit` 발생. 이후 관리자가 Gmail 커스텀 SMTP를 연결하고 실제 인증 메일을 수신해 두 번째 계정 인증까지 완료했습니다.
- 현재 학습용 발송에 Gmail 커스텀 SMTP를 사용 중입니다. 다른 앱과 인증 설정을 공유하므로 별도 승인 없이 Supabase 전역 SMTP·Site URL·이메일 확인 강제 설정을 바꾸지 않습니다.
- Gmail 개인 SMTP는 제한된 학습용 발송에 사용하며, 공개 서비스로 전환할 때는 전용 메일 발송 서비스 및 발송량 제한을 검토합니다. SMTP 앱 비밀번호를 저장소·대화·제출 자료에 포함하지 않습니다.
- A/B 두 계정 이메일 인증·로그인 확인 후 사용자가 2026-10-12에 승인했으며, 메모 소유자 보정과 RLS 정책 적용·검증까지 완료했습니다.

## 로그인 및 이메일 인증 완료 상태 표시 (2026-10-12)

- 로그인 성공 또는 인증 메일 확인 후 로그인에 성공하면 자료실 첫 화면에 **로그인 완료!**와 별도 **이메일 인증 완료** 상태를 계속 표시합니다.
- 인증 메일의 Supabase `type=signup` 콜백으로 돌아오고, 그 세션의 `email_confirmed_at`이 확인된 경우에만 **이메일 인증 완료!**를 강조합니다. 인증되지 않은 세션의 화면에는 완료 문구를 출력하지 않습니다.
- 가입 페이지는 `가입 요청 접수`와 `이메일 인증 완료`를 명확히 구분합니다. 기존 이메일로 반복 가입 시 요청만 접수되고 메일 발송이 없을 수 있다는 안내를 제공합니다.
- 이미지 레이어·로그인·메모 API는 유지하고, 서버의 `owner_id` 검사는 변경하지 않았습니다.
- 인증 이후 `localhost`로 이동하는 문제는 Supabase Dashboard의 **Authentication → URL Configuration → Redirect URLs**에 올바른 Vercel URL이 등록되어야 근본 해결됩니다. 이 프로젝트는 다른 앱도 사용하므로 전역 `Site URL`을 임의로 바꾸지 않습니다.
- 완료 상태 표시 단위 테스트는 `test/step4-api.test.mjs`에서 검증합니다. A/B 실제 접근 차단, RLS·GRANT 적용 및 운영 승인은 별도 검증 작업입니다.

## 4단계 실제 DB 적용 결과와 남은 테스트

- **현재 DB (2026-10-12 실측):** A의 원본 메모 4건, B의 기존 메모 1건, 총 5건. 미지정 0건, **RLS ON·정책 4개**, `anon`은 직접 CRUD 불가, `authenticated`는 본인 소유 CRUD만 허용. 원본 5건의 메모 내용 및 식별자 해시가 변경 전후 동일함
- **A/B 데이터 적용 완료:** `supabase/step4_seed_review.sql`의 승인된 트랜잭션으로 미지정 원본 4건의 소유자만 A로 변경했습니다. B가 직접 만든 메모는 미변경이며 추가 INSERT/DELETE는 실행하지 않았습니다. 실행 전 정확히 Auth 2명·미지정 4건·B 소유 1건을 검사했습니다.
- **RLS 정책 적용 완료:** `supabase/step4_rls_review.sql`의 권한 변경을 Supabase 마이그레이션 `byteback_step4_rls_own_notes_only`로 적용. `PUBLIC`/`anon`/`authenticated`의 기존 테이블 권한을 회수하고 `authenticated`에는 SELECT·INSERT·UPDATE·DELETE만 GRANT했습니다. 정책 4개가 `auth.uid() = owner_id`를 검사하며 `service_role`의 기존 권한은 유지했습니다.
- **권한 검증 완료:** `supabase/step4_verify_permissions.sql`로 실제 RLS, Grants 및 소유자별 건수를 확인했습니다. `supabase/step4_verify_rls_ab.sql` 방식으로 A/B 역할·JWT 사용자 식별자 모의 전환 후 각각 조회 가능 수 4/1, 타인 메모 읽기 및 UPDATE/DELETE 0건을 확인했습니다. 테스트 트랜잭션은 ROLLBACK했습니다.
- **중요:** 서버는 `service_role`을 사용하므로 RLS를 우회할 수 있습니다. 새 API의 원자적 `.eq('owner_id',verified.userId)` 검사를 제거하면 안 됩니다.
- **테스트:** `node --test test/step4-api.test.mjs` (A/B 목록·개별 조회·타인 수정/삭제·소유자 변경 시도·비로그인·심판/학생 구분 로컬 모의시험). 이 테스트가 통과해도 실제 A/B JWT·운영 DB·심판 공격 통과를 증명하지는 않습니다.
- **배포/제출:** `npm run build -- --local`로 정적 파일, `npm run bundle`은 실 배포 확인과 `bundle-notes.json`이 준비된 뒤 실행. 운영 병합 후 `scripts/verify-step4-live.mjs` 및 stage4-live GitHub Action이 /api/notes 비로그인 거부, /aleph.json step=4, nosniff를 확인
- **완료한 A/B 실제 브라우저 점검:** Preview에서 A의 원본 메모 4건, B의 직접 작성한 메모 1건을 확인했습니다. 실제 각 계정으로 로그인하여 상대 메모의 복사한 UUID로 조회할 때 **양방향 404**를 사용자 화면에서 확인했습니다. 타인 메모의 실제 PUT/DELETE는 실행하지 않았으며 자동화된 모의시험 및 RLS 역할시험으로 차단을 검증했습니다. 비밀번호·토큰은 대화나 보고서에 포함하지 않습니다.

## 실제 A/B 브라우저 차단 시험 — 비파괴 검사 화면 (2026-10-12)

- 사용자가 Preview에서 확인: **A 메모 4건만, B 메모 1건만 표시**. 계정 간 목록 분리가 실제 브라우저에서 재현되었습니다.
- 남은 최종 확인을 위해 `public/access-check.html`을 **4단계 개발 Preview 전용**으로 추가했습니다. 로그인 자료실의 `4단계 다른 계정 접근 차단 검사` 링크에서도 열 수 있습니다.
- **실제 브라우저 확인 완료 (2026-10-12):** B에서 본인 메모 ID를 복사 → A 로그인 → `GET /api/notes/:id` 읽기 전용 검사 → **404** 화면 확인. 사용자가 시험 화면을 제공했으며, 메모 ID·계정 이메일·인증 토큰은 보고서에 기재하지 않음.
- **반대 방향 확인 완료(사용자 보고):** A 메모 ID를 실제 A 목록에서 복사해 B 계정으로 로그인하여 검사 → **404** 확인. 유효한 상대방 ID가 아닌 임의 UUID의 404는 차단 증거로 인정하지 않음.
- 이 검사 페이지는 인증된 본인 메모 목록 `GET /api/notes` 및 지정 메모 `GET /api/notes/:id` **두 종류의 읽기 요청만** 사용하며 수정/삭제/추가는 하지 않습니다. 토큰은 브라우저 요청의 Authorization 헤더에만 들어가고 화면·URL·GitHub에 표시/저장하지 않습니다.
- 기존 서버 API의 GET·PUT·DELETE 타인 메모 404 로직, DB RLS 역할 모의 접근 및 GitHub Stage4 자동 테스트는 별도 검증 완료. A→B 실제 브라우저 GET 404 화면과 B→A 실제 GET 404 결과(사용자 보고)까지 확인했습니다. **남은 단계는 운영 main 병합 및 배포 확인**입니다. 실제 로그인 상태의 타인 메모 PUT/DELETE는 추가 수동 검증 없이 성공이라고 주장하지 않습니다.

## 이전 3단계 구현 기록

> 과거 3단계 README의 초기 검증 대기 문구는 현재 상태와 다릅니다. 실제 3단계는 운영 배포·로그인·가상 메모 CRUD·비로그인 JSON 거부까지 확인되었고, 3단계 제출 번들 자동화도 성공했습니다. 다음 섹션은 기존 디자인 및 DB 구조 보존을 위한 이력입니다.

## 3단계 로그인 디자인 · 원본 장면 기반 레이어 애니메이션

- 승인된 2026-10-12 「괴물 단체 + 푸른 정보 보호막」 장면을 재생성하지 않고, `assets/monster-shield-scene.avif.b64`에 원본을 보존합니다. 이미지 안의 가짜 로그인 양식은 제외하고 오른쪽에 실제 Supabase Auth HTML 폼을 표시합니다.
- `scripts/build-public.mjs`는 원본 SHA-256을 검사하고 `public/assets/monster-shield-scene.avif` 및 아래 **3개의 투명 SVG 장면 레이어**를 생성합니다.
  - `scene-city.svg`: 도시·하늘·강변 부분을 부드러운 마스크로 유지. CSS에서는 수평 1.3px 이동(18초)과 별도 도시 조명 약한 반짝임을 적용합니다.
  - `scene-monsters.svg`: 동일한 괴물 단체의 실루엣을 부드러운 마스크로 추출. 전체 그룹만 최대 4px 떠오르는 애니메이션(5.8초)을 적용하며, 새 괴물을 추가하지 않습니다.
  - `scene-shield.svg`: 파란 방어막·자물쇠·데이터 UI 영역을 마스크로 분리. 밝기·글로우 맥동(4.2초)과 빛의 흐름을 적용하며, 작은 기호형 홀로그램 SVG는 별도로 6px 이내 부유합니다.
- 완전한 포토샵 픽셀 단위 분리가 아니라 원본에서 추출한 **깃털(soft) 마스크 기반의 시각적 레이어 분리**입니다. 겹친 부분에는 원본 배경이 일부 함께 보일 수 있지만, 전체 이미지를 흔들거나 확대하는 효과는 사용하지 않습니다.
- 메인 그림 위의 `SECURE`, `DATA SAFE`, 설명용 영문 텍스트·의미 없는 내비게이션, 하단 장식 카드를 제거했습니다. 서비스 이름과 실제 로그인·가입·메모 UI 안내는 유지합니다.
- `public/monster-defense.css`는 데스크톱 2열·모바일 세로 배치를 유지하며, `prefers-reduced-motion: reduce`에서 도시·괴물·보호막·홀로그램 움직임을 끕니다. 실제 로그인 패널은 흔들리지 않습니다.
- 기존 Supabase Auth, 메모 CRUD, 서버 측 `src/verify-login.mjs`는 변경하지 않았습니다.
- GitHub 2·3단계 회귀 검사와 Vercel Preview 빌드, CI 내 생성 SVG 3개 파일 검사를 통과했습니다. **브라우저에서 실제 렌더링 및 A/B 로그인·메모 CRUD 통합 검증은 아직 완료되지 않았습니다.** Preview는 Vercel 보호로 원격 브라우저 직접 검증이 제한될 수 있습니다.

## 기존 작업 보존 및 DB 마이그레이션

- GitHub: https://github.com/dfdfewqk/choi-bujang-secret-vault
- Production: https://choi-bujang-secret-vault-six-jet.vercel.app
- Database: 기존 `pds-diary-t06` 프로젝트의 `public.vault_training_notes` 테이블만 변경합니다.
- 마이그레이션 SQL: `supabase/step3_migration.sql`. 기존 행을 삭제하지 않고 UUID `note_uuid`를 추가하며 새 메모 생성에 장애가 되는 `sort_order` 4건 제한을 해제합니다. 다이어리 테이블은 수정하지 않습니다.
- 기존 가상 메모 4건은 `owner_id IS NULL`인 학습용 공용 샘플로 남깁니다. 로그인한 사용자만 샘플을 볼 수 있고 새로운 메모는 검증된 `owner_id`로 저장됩니다. 목록은 로그인 사용자의 개인 메모와 공용 샘플을 합쳐 보여 줍니다.
- 테이블은 RLS 활성화 상태를 유지하고, `anon`·`authenticated` 역할로 직접 DB를 조회할 수 없습니다. 서버의 Secret Key는 데이터베이스 전체를 볼 수 있으므로 Vercel 서버 환경변수에만 저장해야 합니다.

## Supabase Auth 설정

- `aleph.config.json`의 `step=3` 및 `identityProvider` 발급자·대상·JWKS URL을 참고합니다. `judgeIssuer`는 기존 값을 유지합니다.
- 브라우저에는 Supabase Project URL과 **공개용 Publishable Key만** 사용합니다.
- Vercel 환경변수 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`는 기존에 등록되어 있습니다. JWT, 이메일 비밀번호, Secret Key를 GitHub에 저장하지 마세요.
- 사용자 A/B 계정은 실제 이메일 확인 절차를 통해 만듭니다. 개인정보 대신 실습용 가상 메모만 사용하고, 로그인 비밀번호/토큰을 채팅에 전송하지 마세요.

## 구현 API

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/notes` | 로그인 사용자의 메모와 기존 가상 샘플 목록 |
| POST | `/api/notes` | `{id?,title,body}`를 저장하고 `{id}` 반환 |
| GET | `/api/notes/:id` | `{id,title,body}` |
| PUT | `/api/notes/:id` | 가상 메모 수정 |
| DELETE | `/api/notes/:id` | 메모 삭제, 이후 GET 404 |

모든 데이터 API는 기존 검증 도우미가 인증을 확인한 후에만 DB를 호출합니다. 개별 경로는 Vercel rewrite를 통해 `api/note.js`로 전달합니다. `allowedRoutes`도 이 경로와 일치합니다.

## 검증 및 제출

1. 브랜치에서 `npm ci`, `npm run test:r5`, `npm run test:package`, `node --test test/step2.test.mjs`, `node --test test/step2-api.test.mjs`, `node --test test/step3-api.test.mjs`, `npm run build -- --local` 검증
2. 로그인하지 않은 `GET /api/notes` 및 `GET /api/notes/:id`에서 JSON 401/403과 메모 없음 확인
3. A 계정 정상 로그인·로그아웃·새로고침 세션 복원·A 메모 추가/수정/삭제·삭제 뒤 GET 404 확인
4. 조작·만료·다른 발급자의 토큰을 거부하는지 확인 (실제 실행 전엔 미검증으로 기록)
5. `/data.json` 메모 0건 또는 404, `/aleph.json` `step:3`, 홈페이지 `X-Content-Type-Options:nosniff` 확인
6. 개인 비밀값/메모 본문이 저장소·빌드 아티팩트에 없는지 확인하고, 3단계 제출 시 `npm run bundle` 실행

이전 공개 커밋과 과거 배포는 남을 수 있으므로 과거 노출이 완전히 해소됐다고 주장하지 않습니다. `bundle-notes.json`과 `artifacts/submission.json`은 커밋하지 않습니다.

---

## 이전 단계 기록 (2단계 이하)

# BYTE BACK · 2단계 저장점 (자료를 코드 밖으로 옮기기)

> **작업 상태:** 2단계 DB 테이블 생성, 가상 메모 4건 입력, RLS 검증, Vercel 서버 전용 환경변수 등록과 Preview 재배포를 완료했습니다. 미리보기 URL은 Vercel 인증 보호 때문에 외부 API 응답 검증이 제한되어 있어 운영 반영 후 HTTP 응답을 추가 확인해야 합니다.

## 현재 기능 (최대 5줄)

1. 1단계에서 노출됐던 `data.json`과 `public/data.json`을 현재 소스 트리에서 제거합니다.
2. 브라우저는 `/api/notes`를 호출하고 서버 함수만 `vault_training_notes` 테이블을 조회합니다.
3. Supabase 키는 Vercel 서버 전용 환경변수로만 읽으며 브라우저·응답·로그에 출력하지 않습니다.
4. 빌드는 2단계 이후에도 `public/aleph.json`을 생성하고 공개 `data.json`을 재생성하지 않습니다.
5. **비로그인 `/api/notes` 요청은 아직 허용됩니다.** 3단계에서 인증·인가를 추가해야 합니다.

## 설치와 DB 이전

1. **무료 프로젝트 생성 제한 때문에**, 기존 `pds-diary-t06` Supabase 프로젝트 안에 **새 전용 테이블 `vault_training_notes`만 생성**했습니다. 기존 다이어리 테이블과 데이터는 변경하지 않습니다. 다만 서버 전용 API 키는 프로젝트 전체에 넓은 권한을 가질 수 있으므로 Vercel의 서버 전용 비밀 입력란에서만 관리해야 합니다.
2. Supabase SQL Editor에서 `supabase/step2_schema.sql`을 실행합니다. **2026-10-08 실제 생성 및 RLS 확인 완료**.  `vault_training_notes`에 `owner_id uuid`가 있으며 `auth.users` 외래키는 없습니다. RLS가 켜져 있고 `anon`·`authenticated`에 테이블 접근을 부여하지 않습니다.
3. 기존 가상 메모 **4건만** SQL Editor에서 별도로 입력합니다. **4건 DB 저장 및 건수 검증 완료**.  원문이 들어 있는 시드 SQL은 공개 저장소에 절대 커밋하지 않습니다. `select count(*) from public.vault_training_notes;`로 4건인지 확인합니다.
4. **완료: 서버 비밀값 등록 및 Preview/Production 적용.** Vercel 프로젝트 Settings → Environment Variables에서 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 **서버 비밀 환경변수**로 등록합니다. 실제 값은 GitHub·브라우저 코드·채팅·로그에 붙여 넣지 않습니다. Vercel Preview와 Production에 배포할 단계에 맞게 설정합니다.
5. 브랜치 Preview 재배포와 코드 자동 검사를 완료했습니다. Preview의 HTTP 응답은 Vercel 인증 보호로 외부 자동 확인이 불가능했습니다. Production 배포 후 `/api/notes` 4건을 검증하고 실패 시 운영 배포를 되돌려야 합니다.

## 검증 (배포 전후)

- 코드 검사: `npm run test:r5`, `npm run test:package`, `node --test test/step2.test.mjs`, `npm run build -- --local`. 실제 실행하지 않았다면 결과를 기록하지 않습니다. GitHub Actions의 `Stage 2 checks`도 동일한 검사를 자동 실행하도록 구성했습니다.
- 파일 검색: 현재 브랜치에서 `git grep -n '실습용 가상' -- ':!README.md'`로 메모 본문이 다시 들어왔는지 확인합니다. `git ls-files data.json public/data.json`은 빈 결과여야 합니다.
- 웹: `https://choi-bujang-secret-vault-six-jet.vercel.app/data.json`은 404 또는 메모 0건이어야 합니다. `/aleph.json`은 JSON으로 열려야 하고 `step` 값은 2여야 합니다.
- 홈페이지: 시크릿 창에서 메모 4건이 보이는지 확인합니다. 이는 아직 누구나 API를 읽을 수 있음을 뜻하며 완전한 보호가 아닙니다.
- API: `/api/notes`의 비로그인 GET이 4건을 반환하는지 확인하고, **남은 약점**으로 기록합니다. 설정 오류를 나타내는 503이나 502는 성공이 아닙니다.
- 보안 헤더: 홈페이지 응답에서 `X-Content-Type-Options: nosniff`가 있는지 개발자 도구 Network에서 확인합니다.
- `npm run bundle`: 로컬에 Git 저장소를 체크아웃하고 `bundle-notes.json`에 실제 점검 결과를 기입한 뒤, **저장·배포·시험 완료 후** 실행합니다. 결과 파일 `artifacts/submission.json`은 제출용이며 커밋하지 않습니다.

**이전 공개 이력의 한계:** 새로운 현재 파일에서 메모를 없애도 1단계 공개 커밋의 `data.json`, 이전 Vercel 배포·프리뷰, 캐시 등은 남을 수 있습니다. 과거 노출이 해소됐다고 주장하지 않습니다. 이번 실습에는 가상 메모만 사용합니다.

---

## 1단계에서 사용한 시작 안내 (과거 기록)


이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
