# 8단계 구역 계약: 메모 / 강사 공지

| 자료 | 내부 자원 ID | 영속 자료 | API |
|---|---|---|---|
| 개인 메모 | `note:<UUID>` | 기존 `vault_training_notes.note_uuid` | 기존 `/api/notes/:id` |
| 강사 공지 (예약 구역) | `announcement:<UUID>` | 없음 | 없음 (기본 거부) |

- 내부 접두사는 DB 구조와 기존 응답의 `id` UUID를 바꾸지 않습니다. UI·기존 배포 주소도 불변입니다.
- 판정기: `request.service/method/path/route/queryLength`를 동시에 확인하고 미확인 경로 또는 강사 공지 요청은 `deny/resource_not_allowed`를 반환합니다. 기능을 고르는 쿼리나 `/notes/export` 같은 :id와 같은 깊이 경로는 허용하지 않습니다.
- `/notes/demo`는 기존 `judge_fixture` 테스트에서만 허용되는 합성 ID입니다. 실제 API는 UUID만 허용합니다.
- 메모 API: 서버가 확인한 `verified.userId`만 소유자로 사용합니다. SELECT·UPDATE·DELETE에서 저장된 `owner_id`와 동일 조건을 DB 쿼리에 포함하고 타인 메모와 없는 메모는 구별 없이 404입니다.
- 현재 `aleph.decision.v1`은 `subjectId`(별도의 가명이며 Supabase `userId`가 아님)를 주지만 **소유자 매핑과 검증된 강사 역할**은 제공하지 않습니다. 따라서 판정기에서 A/B 소유자나 강사 권한을 가정하지 않았고 공지 생성·읽기·수정을 모두 닫았습니다.
- `resource_not_allowed`가 심판 등록부의 `allowedReasonCodes`에 존재하는지는 공개된 계약 자료만으로 확인할 수 없습니다. 불일치하면 엔진은 요청을 거부합니다. 실제 강사 계정 허용을 주장하지 않습니다.
- 개인키/토큰/실명/메모 본문, 다른 DB 테이블, SMTP 및 Auth 설정은 수정하지 않습니다.

## 심판 S08_OTHER_ZONE_ALLOWED 보완

- 기존 판정기가 `GET /notes/:id`의 UUID 형식만 보고 임의 사용자에게 `allow`를 반환하던 문제를 확인했습니다.
- 요청 계약에 검증된 노트 소유권 결합이 없으므로, 판정기에서 사용자 ID와 UUID를 억지로 비교하지 않습니다. 대신 **소유 관계가 입증되지 않은 개별 UUID GET을 명시적으로 거부**합니다. (학습용 `/notes/demo`는 별도 가상 테스트로 보존.)
- 서버의 실제 `/api/notes/:id`는 이전부터 검증된 `userId`와 DB `owner_id`를 함께 검사하여 본인 정상 접근만 열어줍니다. 판정기 단건 읽기 허용은 엔진의 소유 증명 계약이 추가되기 전까지 보류합니다.
- 36/100 심판 재채점은 따로 확인해야 하며, 로컬 검사만으로 100점이나 실제 자료 누출 차단 검증을 주장하지 않습니다.
