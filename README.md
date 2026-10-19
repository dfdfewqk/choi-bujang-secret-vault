# HORSE · ALEPH 보안 프로젝트

이 저장소에는 서로 구분해야 하는 두 작업 환경이 있습니다. **파일이 비슷해 보여도 1~12단계 웹서비스와 13~22단계 HORSE 보안 Agent를 서로 대신할 수 없습니다.** 기존 사용자 자료와 보안 기능은 보존합니다.

## 1~12단계: 기존 웹서비스 (저장소 루트)

- 공개 사이트: https://choi-bujang-secret-vault-six-jet.vercel.app/
- Vercel은 루트 `vercel.json`에 따라 `npm run build`를 수행하고 `public/`을 게시합니다.
- 코드: `api/`, `src/`, `scripts/`, `public/`, `xdr/`. 이전 단계 검증: `test/`, `.github/workflows/`.
- 이미지 입력 `assets/monster-shield-scene.avif.b64`는 실제 빌드에서 사용하므로 지우지 않습니다.
- 실행: `npm ci`, `npm run build -- --local`; 로컬 테스트는 `node --test test/*.test.mjs`, `npm run decider:test`, `npm run detect:test`.
- `npm run bundle`은 별도 제출용 묶음 작성입니다. 테스트 성공을 공식 통과로 표시하지 않습니다.

## 13~22단계: HORSE 보안 Agent (`on-client/`)

- 시작 안내: [on-client/README.md](on-client/README.md)
- 단계별 학습 자료: [on-client/docs/STUDENT_PROMPTS.md](on-client/docs/STUDENT_PROMPTS.md)
- 실제 구현 위치: `on-client/student/extension.mjs` (`renderAiConnection`, `renderExplanation` 등).
- 앱 실행에 필요한 제공 서버·UI·연결 모듈은 `on-client/src/`, `on-client/public/`, `on-client/vendor/`에 있습니다.
- 설치와 업데이트 검증에는 `on-client/.on-starter-manifest.json`과 `on-client/tools/`가 관련됩니다. 임의 삭제하지 않습니다.
- 공식 소스 검토 AI, 앱 안의 실제 AI 연결, Workbench 학습용 AI는 서로 다른 역할입니다. 실제 모델 호출 여부를 모의 결과로 대신하지 않습니다.
- 실행은 `on-client/README.md`와 [실행 안내](on-client/docs/STUDENT_LAUNCH_GUIDE.md)를 따릅니다.

## 과거 기록 및 보존

긴 개발·실험·오류 대응 일지는 **삭제한 것이 아니라 이력 브랜치에 원문 그대로 보존**했습니다.

- [정리 전 README 원문](https://github.com/dfdfewqk/choi-bujang-secret-vault/blob/25c04b604cf77cb77b48ebcc7cff11f2a4519d34/README.md)
- [정리 전 1~12단계 문서](https://github.com/dfdfewqk/choi-bujang-secret-vault/tree/25c04b604cf77cb77b48ebcc7cff11f2a4519d34/docs)
- [정리 전 전체 소스](https://github.com/dfdfewqk/choi-bujang-secret-vault/tree/25c04b604cf77cb77b48ebcc7cff11f2a4519d34)

현재 계정·API 키·토큰·실명·운영 로그를 README나 Git 기록에 복사하지 마세요. 실행 코드·보안 정책·Git 기록을 유지하면서 문서 용량만 정리합니다.
