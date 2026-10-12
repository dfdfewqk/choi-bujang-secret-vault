# BYTE BACK · 4단계 개발 브랜치 (로그인해도 내 자료만 보이게 합니다)

> **상태 (검토 대기):** 3단계 운영 서비스는 그대로 유지합니다. 4단계 API 소유자 조건은 `stage4-owner-isolation` 브랜치에 구현했습니다. B 시험 계정이 아직 확인되지 않았고, 원본 메모 4건은 현재 DB에서 모두 `owner_id IS NULL`입니다. **SQL 승인·적용, 두 계정 실사용 교차 테스트, 운영 병합, 4단계 제출은 아직 완료되지 않았습니다.**

## 이번 브랜치의 기능 (5줄)

1. 기존 Supabase Auth 이메일·비밀번호 로그인/가입/로그아웃/세션 복원 및 그림 레이어 애니메이션은 그대로 유지합니다.
2. `src/verify-login.mjs` 계약을 유지하고, 로그인 토큰에서 **서버가 검증한 userId**만 사용합니다.
3. 목록 GET은 `owner_id = userId` 필터, 개별 GET·PUT·DELETE는 `note_uuid`와 `owner_id` 동시 조건으로 제한합니다.
4. 메모 POST는 인증된 소유자로 저장하고, PUT은 제목/본문만 수정하며 요청 본문 `owner_id`를 거부합니다.
5. DB 소유자 지정·RLS는 검토용 SQL만 저장했습니다. 사용자 승인 전에는 실행하지 않으며 3단계 운영 주소를 바꾸지 않습니다.

## 사이트에서 직접 가입할 수 있도록 설정하기

- 기존 `학습용 계정 만들기` 버튼은 Supabase Auth `signUp`을 그대로 호출합니다. 관리자가 B 계정을 대신 만드는 방식이 아닙니다.
- 확인 메일의 반환 주소는 프런트엔드에서 `emailRedirectTo: new URL('/', window.location.href).href`로 지정합니다. Supabase Auth URL Configuration의 Redirect URLs에 실제 가입 사이트 URL을 등록해야 합니다. 운영 URL: `https://choi-bujang-secret-vault-six-jet.vercel.app/**`. 미리보기 도메인을 이용한 가입은 그 주소도 추가로 허용해야 합니다.
- **실제 발송 차단 원인:** Supabase 로그의 `/signup` HTTP 429 및 `over_email_send_rate_limit`. 기본 Supabase SMTP는 시간당 약 2건으로 제한되며 프로젝트 팀 이메일 외 주소로 발송이 제한됩니다. 앱 코드만으로 해결되지 않습니다.
- 정상적인 회원가입을 위해 프로젝트 관리자 화면 `Authentication → SMTP Settings`에 **별도의 정상적인 SMTP 제공자**를 설정해야 합니다. 인증메일 확인을 프로젝트 전체에서 끄거나, 가입 API에서 사용자 이메일을 임의로 검증 처리하지 않습니다. 이 Supabase 프로젝트의 다른 다이어리 앱도 같은 Auth 설정을 사용하므로 담당자 확인이 필요합니다.
- 단기 개인 학습용 발송에 발신자가 소유한 네이버 메일 SMTP를 사용할 수도 있지만, 공개 서비스에는 별도 메일 발송 계정/도메인을 가진 전용 SMTP 제공자를 권장합니다. 네이버 메일 공식 정보는 `smtp.naver.com`, 포트 `587`(TLS), 2단계 인증 및 외부 앱 비밀번호 필요. 비밀번호는 공식 네이버 및 Supabase 화면에만 입력하고 GitHub/대화에 공유하지 않습니다.
- B를 사이트에서 가입하고 실제 메일 인증·로그인한 뒤에야 `supabase/step4_seed_review.sql` 및 `supabase/step4_rls_review.sql`를 사용자 승인 후 진행합니다.

## 4단계 적용 전 확인 사항

- **현재 DB:** 실제 이메일 확인 Auth 사용자 1명, 미지정 학습용 원본 메모 4건. B 계정 이메일 인증 필요
- **A/B 데이터 초안:** `supabase/step4_seed_review.sql`. A/B 이메일은 사용자가 자신의 Supabase SQL Editor에서만 입력합니다. 기존 4건을 A에게 지정하고 B 시험 메모 1건만 추가합니다. 정확히 4건인 경우에만 실행되며 오류 시 트랜잭션 롤백
- **권한 초안:** `supabase/step4_rls_review.sql`. `PUBLIC`/`anon`/`authenticated`의 기존 테이블 권한을 회수하고 `authenticated`에는 SELECT·INSERT·UPDATE·DELETE만 GRANT, 정책 4개로 `auth.uid() = owner_id` 검사. 사용자가 검토·승인할 때까지 **실행하지 않음**
- **권한 확인:** `supabase/step4_verify_permissions.sql`은 데이터 변경 없는 조회 쿼리. `information_schema.role_table_grants`, `has_table_privilege`, `pg_policies` 점검
- **중요:** 서버는 `service_role`을 사용하므로 RLS를 우회할 수 있습니다. 새 API의 원자적 `.eq('owner_id',verified.userId)` 검사를 제거하면 안 됩니다.
- **테스트:** `node --test test/step4-api.test.mjs` (A/B 목록·개별 조회·타인 수정/삭제·소유자 변경 시도·비로그인·심판/학생 구분 로컬 모의시험). 이 테스트가 통과해도 실제 A/B JWT·운영 DB·심판 공격 통과를 증명하지는 않습니다.
- **배포/제출:** `npm run build -- --local`로 정적 파일, `npm run bundle`은 실 배포 확인과 `bundle-notes.json`이 준비된 뒤 실행. 운영 병합 후 `scripts/verify-step4-live.mjs` 및 stage4-live GitHub Action이 /api/notes 비로그인 거부, /aleph.json step=4, nosniff를 확인
- **A/B 수동 점검:** 두 실습 계정에서 각자 GET·POST·PUT·DELETE 성공 / 상대방의 개별 GET·PUT·DELETE 404를 확인한 뒤에만 운영 반영

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
