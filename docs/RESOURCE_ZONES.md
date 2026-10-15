## 2026-10-15 공식 심판 48점 S08_OTHER_ZONE_ALLOWED 교정

- 심판이 실제 실패 요청을 `GET /notes`로 특정함. 이전 SDP의 `note:collection` GET 허용이 원인이었음.
- 이제 `GET /notes`와 `GET /api/notes`는 `deny/resource_not_allowed`. GET UUID 단건은 정확한 경로와 기기 검사를 거친 뒤 `allow`, 실제 소유자 확인은 최종 REST API에서 시행함.
- 기존 판정기는 정반대로 단건 GET만 차단하고 컬렉션 GET을 허용했던 것이 실수. 본인 GET을 막는 부작용을 제거함.
- 강사·공지 API의 수정 경로는 역할 증명이 없으므로 전부 거부함. 잘못된 경로, 쿼리, export 및 기기 등록 실패도 거부함.
- `test/step8-scoped-policy.test.mjs`에서 전체 목록 차단, 단건/등록 기기 동작, 공지 쓰기, 6~7단계 회귀, 응답 5키/ruleIds/계약 외 필드 무사용을 검사함.
- 기존 `aleph.config.json.step=8`, DB 및 XDR-01~06 코드는 불변. 운영 배포/심판 통과는 별도 확인.

---

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
5. **2026-10-15 S08 공식 판정 교정:** 심판이 특정한 유출 허용 경로는 `GET /notes`임. `/notes` 및 `/api/notes` 전체 목록 GET은 판정기에서 `deny/resource_not_allowed`. 개별 UUID GET/PUT/DELETE는 등록 기기·정확한 route 검사를 거쳐 판정하고, 실제 본인/타인 비교는 최종 REST API의 JWT 및 `note_uuid + owner_id` 복합 조건이 수행함. 요청 계약에 없는 role/owner는 만들지 않고 공지 관련 경로는 모두 거부함. POST 메모 컬렉션은 기존 새 메모 생성 지원을 위해 유지하되 서버가 소유자와 새 UUID를 발급함.
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
