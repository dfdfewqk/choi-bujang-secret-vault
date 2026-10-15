# 11단계 접속 앱과 서버 승인

이 구현은 학생 자료실 내부 계약 `byteback.app.request.v1`입니다. 공식 반 엔진의 승인 API/서명 헤더와 동일하다고 주장하지 않습니다. `src/decider.mjs`는 기존 공식 18필드 계약과 5필드 응답을 유지하며, 앱 요청 검증은 최종 메모 API의 추가 게이트입니다.

## 학생 화면

1. 기존 사이트에서 로그인합니다. 이전 localStorage/sessionStorage 토큰은 삭제하며 재사용하지 않습니다.
2. 기기 승인 요청을 누르면 ECDSA P-256 키를 만듭니다. 개인키는 non-extractable CryptoKey로 현재 페이지 메모리에만 존재합니다. 공개키만 `/api/device`에 등록합니다.
3. 학생 요청은 pending입니다. 설치 표시, 로그인, 버튼 클릭 또는 본문의 approved/role 값으로 승인되지 않습니다. 대기 중에는 메모를 읽거나 표시하지 않습니다.
4. 운영자가 아래 서버 절차로 특정 요청을 승인한 뒤 학생이 승인 결과 확인을 누릅니다. 서버가 approved를 반환하고 서명된 메모 GET이 통과할 때 기존 자료실이 열립니다.
5. 키/토큰을 지속 저장하지 않으므로 새로고침·페이지 이동·브라우저 종료 뒤 다시 로그인하고 승인받아야 합니다. 승인은 최대 8시간, 계정당 활성 요청 최대 8개입니다. 승인 취소/만료/서버 확인 실패/오프라인 때 자료실을 숨깁니다.
6. 계정별 읽기 검사는 자료실 안의 대화상자로 열어 같은 페이지 메모리 세션을 유지합니다.

## 운영자 승인

학생 요청에 표시된 16자리 기기 ID를 확인하고 Supabase의 관리자 SQL Editor에서 아래 조회로 **해당 요청과 계정**을 확인합니다. 요청 전체를 일괄 승인하지 않습니다. 사용자·공개키·시간의 확인은 운영자 책임이며 앱 화면은 관리 대상 하드웨어 증명을 제공하지 않습니다.

```sql
SELECT owner_id,device_id,state,created_at,expires_at
FROM byteback_private.app_devices
WHERE device_id='<확인한 16자리 기기 ID>' AND state='pending';
-- 대상 계정과 요청을 확인한 뒤에만:
SELECT byteback_private.review_app_device('<확인한 owner UUID>','<기기 ID>',true);
-- 취소:
SELECT byteback_private.review_app_device('<확인한 owner UUID>','<기기 ID>',false);
```

승인 함수는 SECURITY INVOKER이며 PUBLIC/anon/authenticated/service_role 접근을 차단합니다. 학생용 HTTP 승인 경로는 없습니다. 메모 서버의 service_role도 학생 요청을 승인하지 못합니다.

서명 검증된 공식 judge A/B는 기존과 같이 학생 계정과 다른 run별 시험 owner에 묶입니다. 그 **격리된 시험 공간에서만** 등록 요청을 trial 승인합니다. 학생이나 본문의 role 주장은 이를 사용할 수 없습니다. 공식 심판이 이 학생 앱 계약을 사용하는지는 재채점으로 확인해야 합니다.

## 보호 요청 서명

`Authorization: Bearer <검증할 JWT>`와 아래 4개 머리글을 사용합니다.

- X-Byteback-App-Device: 공개키의 canonical JSON SHA-256 앞 16자리
- X-Byteback-App-Time: UTC ISO 시각, 서버와 30초 이내
- X-Byteback-App-Nonce: 매 요청의 UUIDv4
- X-Byteback-App-Signature: ECDSA/SHA-256 IEEE-P1363 64바이트의 base64url (패딩 없음)

서명 문자열은 JSON 배열 `["byteback.app.request.v1",deviceId,method,path,bodyHash,tokenHash,at,nonce]`입니다. bodyHash는 정렬 canonical JSON의 SHA-256, GET/DELETE는 빈 문자열의 SHA-256입니다. tokenHash는 Authorization 전체의 SHA-256입니다. 본문 JSON 키 순서/공백은 의미가 같아 정규화하며 실제 내용 변경은 거부합니다.

논리 경로는 `/api/notes` 또는 `/api/notes/<UUID>`입니다. 기존 Vercel 개별 메모 rewrite의 id는 서버 경로 선택에 사용하고 기존 query 검증으로 다른 query를 거부합니다. 서버에 승인된 공개키와 owner로 검증하며, 브라우저가 보낸 공개키/승인 헤더는 보호 요청 권한으로 쓰지 않습니다.

검증된 서명은 DB RPC에서 승인/만료를 재확인하고 nonce를 원자적으로 소비합니다. 서버 인스턴스 간에도 재사용이 거부됩니다. 2분 지난 nonce만 정리하며 오래된 요청은 시각 검사에서 거부됩니다. 기존 메모 owner+ID 조건과 복구 백업 검증은 유지합니다. 기기 감사는 추가만 합니다.

## 검증 기록

- 전체 Node 회귀 132건 통과 (이전 단계 소유권 테스트는 앱 게이트를 명시적으로 모의하며 앱 서명은 11단계 별도 시험으로 확인).
- 브라우저 WebCrypto non-extractable 개인키와 Node ECDSA 검증 호환 시험 통과.
- 서명 누락·미승인/취소·다른 owner·경로/본문/토큰 변경·서명 재사용 거부.
- 실제 DB에서 pending 거부 → 운영자 승인 → nonce 최초 허용/재사용 거부 → 취소 후 거부를 트랜잭션으로 시험 후 ROLLBACK. 기존 메모 5건, 기기/nonce/신규 감사 잔여 0건.
- 공식 시험 JWT로 운영 HTTPS 전체 흐름과 공식 11단계 점수는 미실행.
- 브라우저 화면 자동검사는 실행 환경의 Chromium 다운로드 실패로 미실행. HTML/모듈 구문 검사와 로컬 빌드만 완료.
- 비공개 테이블의 RLS 정책 없음(INFO)은 기본 거부 의도입니다. 기존 유출 비밀번호 보호 비활성화 경고는 이번 범위에서 설정 변경하지 않았습니다. 참고: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
