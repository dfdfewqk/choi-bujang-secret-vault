# 10단계 메모 복구: 안전한 DB 준비 (2026-10-15)

이 SQL은 **기존 자료 5건을 소급 백업하지 않습니다**. 현재 정상 여부가 입증되지 않은 자료를 침해 전 사본으로 가장하지 않습니다.

- 새 메모가 **처음 INSERT될 때만** 사본을 `byteback_private.note_origins`에 기록합니다. UPDATE/DELETE 뒤 사본은 변경하지 않습니다.
- `byteback_private` 스키마는 외부 공개 불가이며 `anon`/`authenticated`/`service_role`의 직접 접근 권한을 회수합니다.
- `public.byteback_preview_note_restore`: 사본 존재·SHA-256·현재 상태 차이 **읽기만**, 민감한 제목/내용은 반환하지 않습니다.
- `public.byteback_restore_one_note`: 백업 해시·소유자 확인 후 지정 한 건만 복원하고 감사 기록을 추가합니다. 다른 메모와 감사 이력을 수정하지 않습니다.
- 두 공개 RPC는 **service_role만 호출할 수 있으며**, `api/restore.js`가 먼저 서명된 JWT를 검증한 뒤 실제 소유자를 전달합니다.
- 같은 신원에 여러 사본이 있으면 경로에 정확한 note ID가 있어야 합니다. 하나만 있는 시험 신원에서는 ID 생략을 허용합니다.
- **사전 정상 데이터 증명 없이 기존 메모를 덮어쓰지 마세요.** 보관된 사본 자체가 없으면 `404 BACKUP_NOT_FOUND`로 중단합니다.

적용 순서: GitHub CI 테스트 → Supabase `apply_migration` → 읽기 전용 권한/트리거 검사 → 하나의 병합과 Vercel 배포 → 가상 B 계정에서 생성·변조·삭제·복원 테스트. 실제 학생의 5건은 쓰거나 백필하지 않습니다.
