# 8단계 구역 권한 통합 점검 — 최신 사실 기준

## 확정된 기준과 결과

| 경계 | 보안 규칙 | 확인 |
|---|---|---|
| 정상 학생 메모 | 서명 검증된 Supabase 사용자 UUID = 데이터베이스 owner_id | 실제 서버 함수/DB 조건 확인, 모의 A/B 테스트 |
| 심판의 시험용 A/B | ES256/issuer/audience/만료/run 검증 뒤 runId+A/B 별도 HMAC 소유자 | 실제 ES256 서명/검증 + 서버 메모 API 통합 테스트 |
| 특정 메모 GET/PUT/DELETE | 같은 SQL 요청에서 note_uuid와 검증된 owner_id를 모두 조건으로 사용 | 소스와 통합 테스트 |
| 메모 목록 | 검증된 owner_id만 반환, NULL/타인 행 제외 | 소스와 통합 테스트 |
| 메모 생성 | 임의 owner_id/외부 UUID를 입력받지 않고 서버가 UUID 생성 | 소스와 통합 테스트 |
| 메모 수정 | title/body만 변경 가능, owner_id/id/note_uuid 변경 요청 차단 | 소스와 통합 테스트 |
| 강사 공지 | 검증된 강사 계약/공식 API 없음 → 학생 요청 기본 거부 | 정책과 API 존재 여부 검사 |
| 원본 Supabase API | anon/authenticated 직접 테이블 접근 권한 폐지, service_role만 서버에서 사용 | 운영 DB 권한을 읽기 전용 확인 |
| 6·7단계 SDP | 미등록 기기 거부, 이상 요청 재확인, 기존 /notes/demo 실습 유지 | 회귀 테스트 |
| XDR-01~04 | 독립 감지 모듈, 8단계 코드 수정 대상 아님 | 회귀 테스트 |

## 반복 36점의 원인 후보와 대응

1. **검사된 실제 배포가 최신 GitHub 코드가 아니었음 (확인).** 마지막으로 확인된 운영 배포 커밋은 `c36b634bb9dc`, 8단계 심판 신원 수정 GitHub 커밋은 `d949f9849a26`이었음. 배포 시도는 `Deployment rate limited — retry in 24 hours`로 실패한 상태였음. `scripts/verify-stage8-deployment.mjs`는 실제 운영 `/aleph.json`의 40자리 SHA를 Git HEAD와 대조해 CURRENT / STALE / UNVERIFIED로 기록함. `npm run bundle`과 GitHub 테스트의 성공은 운영 배포/실제 심판의 성공을 의미하지 않음.
2. **심판 신원을 가입순서로 실제 학생에게 연결한 잘못된 권한 매핑 (기존에 제거).** 지금은 서버가 서명된 시험 runId+A/B에 별도의 소유자를 부여함. 학생 본인은 기존 Supabase 사용자 식별자를 유지함.
3. **실제 서명/인가 연결에 대한 테스트 부족 (이번 보완).** 이전 테스트는 인증 판정 함수를 가짜로 바꿔 JWT 서명 검증을 거치지 않았음. `test/step8-signed-jwt-end-to-end.test.mjs`에서 임시 테스트 키로 서명한 ES256 JWT를 실제 `createLoginVerifier`에 전달하고, 유효·변조·발급자·대상·역할 오류 및 API 본인/타인 접근을 검증함. 개인키/토큰을 저장소에 저장하지 않음.
4. **허용되지 않은 자원 선택 경로 (이번 보완).** POST에 이어 PUT 본문에서도 `id`, `note_uuid`를 거부함. 실제 자원 ID는 URI에서만 취함.
5. **SDP v1에 자원 소유자가 포함되지 않는 제약 (해결되지 않은 계약 제약).** `subjectId`는 Supabase UUID와 비교할 수 없는 가명이고 이 요청은 `ownerId`를 제공하지 않음. 개별 UUID GET은 정책에서 소유자 증명 없이 허용하지 않으며, REST API는 검증된 JWT/DB 소유권 조건으로 본인 GET을 허용함. 동일 판정 호출에서 본인/타인을 구분하려면 반 엔진이 검증한 새로운 소유권 결합 계약이 필요함. 18개 필드 밖의 role/owner를 조작해 넣지 않음.
6. **내부 rewrite 경로 `/api/note?id=...` 존재 (접근 우회 후보).** 현재 직접 호출하더라도 `src/notes-api.mjs`의 JWT 및 `owner_id` 조건을 거쳐야 하므로 타인 자료 조회를 허용하는 우회는 아님. 운영 배포가 막힌 동안 기존 Vercel rewrite를 바꿔 정상 메모 경로를 깨뜨리지 않음.

## 확인 명령

```sh
node --test test/step8-signed-jwt-end-to-end.test.mjs test/step8-judge-binding.test.mjs test/step8-resource-zones.test.mjs test/step4-api.test.mjs
npm run decider:test
npm run fixture:7
node scripts/verify-stage8-deployment.mjs --strict
npm run bundle
```

- **CURRENT**: Vercel 운영 manifest의 SHA와 현재 Git HEAD 일치. 별도로 심판에 제출해 검증 필요.
- **STALE**: 운영 배포가 오래됨. GitHub 테스트의 점수를 심판 통과로 주장하지 말고 최신 main SHA의 Vercel 배포 후 제출.
- **UNVERIFIED**: 사이트 또는 manifest 접근 불가. 새 배포를 확정할 수 없음.

이 점검은 실제 비밀번호·실학생 메모 내용·비밀키에 접근하거나 데이터를 변경하지 않음. 공개되는 것은 가상 테스트에서의 응답 상태 코드만임.
