# HORSE 22단계 — 최종 커밋 새 환경 재현 기록 및 릴리스 상태

> **작성일:** 2026-10-26 (Asia/Seoul)  
> **대상:** ALEPH 13~22단계의 `on-client/` 학생 보안 Agent(HORSE, 공식 스타터 이름 KESHEV)  
> **근거 수준:** GitHub 코드·제공 설명서 **원문 확인**(GitHub 원문 검토: 2026-10-26T10:18:24+09:00). 작성 환경의 `node --version`은 **v22.16.0**으로 직접 확인했지만 이는 전체 프로젝트/Windows 실행 테스트가 아니다. 새 Windows 폴더에서의 실행·브라우저 재현·로그인·유료 AI·실제 집행은 **미실행/미확인**. 이전 단계에서 별도로 수행한 모의 테스트는 이 최종 커밋의 실제 운영 재현으로 세지 않는다.

## 1. 제출 대상과 버전 고정

| 항목 | 값 / 기록 방법 |
| --- | --- |
| 저장소 URL | `https://github.com/dfdfewqk/choi-bujang-secret-vault` |
| 22단계 작업 브랜치 | `fix/horse-stage22-official-feedback-20261026` |
| 변경 전 확정된 21단계 기준 커밋 | `a2b3635521c5e11e0e6696bd1e1399672fc87c7d` |
| 이전 공식 판정 원문 SHA (2026-10-26 10:13 KST) | `cd44031b6931f83e216f39d9a58c62b3b07f3603` — 실제 이전 제출 커밋, 새 제출 SHA와 혼동하지 않음 |
| Node 버전 선언 수정이 들어간 기준 원문 커밋 SHA | `bfef82deb9b3903a88ef169cab3636d7e45b36e1` — 이 문서 수정 전 코드 커밋 |
| **현재 22단계 최종 제출·새 폴더 재현 SHA** | 새 작업 브랜치 `HEAD`의 **실제 40자리 SHA**를 GitHub 커밋 정보와 `git rev-parse HEAD`로 얻고 공식 제출란에 기재한다. 새 폴더에서도 제출한 동일 SHA를 확인한다. 커밋은 자신의 문서 내용까지 해시하므로 **해당 문서에 자기 최종 SHA를 미리 기입하는 것은 기술적으로 불가능**하다. 위에 기입한 두 실제 SHA는 원문 증거이지만 이번 새 제출 SHA가 아니다. |
| 앱 패키지 원문 버전 | `on-client/package.json`: `alekov-client-starter`, `0.2.11` |
| Node.js 지원 선언 | `on-client/package.json` → `engines.node: >=22.0.0 <25.0.0` (22~24 메이저 허용); 권장·수업 기준은 24.19.0. 해당 지원 **선언**과 모든 버전의 Windows 실기기 **검증**은 별도이다. |
| 릴리스 구분 | **검증 중(Pre-release / UNV)**. `v1.0` 확정 또는 실제 운영 인증 **아님** |
| 학생 실행 진입점 | `on-client/tools/start-alekov.ps1` → `on-client/src/server.mjs` |
| 기존 데이터 | 루트의 BYTE BACK 서버·DB 및 개인 인증 파일은 이 단계에서 수정·복원·삭제하지 않는다 |

이 단계의 수정 대상은 **학생 재현 문서와 버전 기록(`on-client/package.json`의 `engines.node`)**이다. 이전 13~20단계 학생 화면 구현, 21단계 설명서, 원래 폴더·Git 기록·원격 DB·인증 설정을 변경하지 않는다. 시작 폴더가 달라도 `on-client/`의 동일 최종 SHA를 비교해야 하며, 단계마다 다른 커밋에서 통과한 결과를 합산하지 않는다.

원래 폴더와 새 폴더는 아래 명령을 실행하는 학생의 PC에서만 확인할 수 있다. 이 문서 작성 중 사용자 PC에서 원래 작업 폴더가 보존됐는지 **직접 확인하지 못했다**.

## 2. 전체 프로젝트를 새 빈 폴더로 받기 — Windows PowerShell

**먼저 확인:** 기존 프로젝트에서 파일을 삭제·초기화하거나 브랜치를 강제로 되돌리지 않는다. 가능하면 기존 Git 최상위에서 `git status --short`와 `git rev-parse HEAD`를 기록해 미커밋 작업과 기준 커밋을 보존한다. Git 변경이 있으면 그대로 남긴다.

다음은 **프로젝트 밖 새 폴더**에 GitHub 작업 브랜치를 별도로 받는 실제 Git 명령 형식이다. 현재 작성자는 Windows 실행을 하지 않았고 명령 실행 결과도 받지 못했다.

```powershell
# 기존 프로젝트와 다른 새 PowerShell 창에서 실행한다.
git --version
$repoUrl = 'https://github.com/dfdfewqk/choi-bujang-secret-vault.git'
$branch = 'fix/horse-stage22-official-feedback-20261026'
$newRoot = Join-Path $HOME 'horse-stage22-clean-check'
if (Test-Path -LiteralPath $newRoot) { throw '새 폴더가 이미 있습니다. 기존 폴더를 보존하고 새 이름을 선택하세요.' }
git clone --branch $branch --single-branch $repoUrl $newRoot
if ($LASTEXITCODE -ne 0) { throw 'clone 실패: 인증 또는 저장소 접근을 확인하세요.' }
Set-Location -LiteralPath $newRoot
git status --short
git rev-parse HEAD
```

- 비공개 저장소라면 자신의 GitHub 권한으로 접근한다. 암호·토큰을 챗/문서/커밋에 붙여 넣지 않는다.
- clone을 할 수 없지만 기존 **로컬 Git 저장소에 최종 커밋이 실제로 존재**한다면, 그 저장소를 대상으로 `git clone <기존 Git 폴더 경로> <새 빈 폴더 경로>` 하는 대안이 있다. 로컬에 커밋이 없는 경우 이전 SHA를 최신처럼 사용하지 않는다. 수료 패키지 내보내기 도구가 공식 제공됐다면 그 절차도 가능하지만 이 문서에서는 확인되지 않은 옵션을 만들어 쓰지 않는다.
- **이 문서를 포함한 최종 커밋 SHA**는 GitHub 커밋 정보 또는 공식 제출 화면에서 확인한다. 아래 검사를 실행할 때 40자리 값을 그대로 넣고 새 폴더의 `HEAD`와 대조한다. 샘플이나 21단계 커밋을 최종 SHA로 대신하지 않는다.

```powershell
# 위 git clone이 성공한 새 Git 최상위 폴더에서 실행한다.
$clonedHead = (git rev-parse HEAD).Trim()
Write-Host "새 폴더에서 확인된 40자리 HEAD SHA: $clonedHead"
$expectedCommit = (Read-Host '22단계 과제 화면에 제출할 실제 40자리 커밋 SHA').Trim()
if ($clonedHead -ne $expectedCommit) { throw '새 폴더 HEAD가 제출 SHA와 다릅니다. 재현 검사를 중단하세요.' }
if ($expectedCommit -notmatch '^[0-9a-f]{40}$') { throw '정확한 40자리 커밋 SHA를 입력하세요.' }
git switch --detach $expectedCommit
if ($LASTEXITCODE -ne 0) { throw '해당 커밋이 로컬에 없습니다. 원격 브랜치와 제출 커밋을 확인하세요.' }
$actualCommit = (git rev-parse HEAD).Trim()
if ($actualCommit -ne $expectedCommit) { throw '최종 커밋 불일치: 재현 중단' }
git status --short
Get-Date -Format o
```

**기대 결과:** `HEAD`가 정확히 제출 SHA와 같고 새 폴더의 작업 트리가 깨끗하다. 이 항목은 **Windows 실제 실행 전이므로 미확인**이다. 위 고정 SHA는 이전 판정과 수정 기준이며 이번 최종 제출 SHA는 따로 확인한다. 기존 프로젝트 폴더의 데이터나 인증 파일을 새 폴더에 무작정 복사하지 않는다.

## 3. 21단계 설명서로 설치·실행·브라우저·종료·재실행

위 40자리 SHA 확인 뒤 **새 폴더의 `on-client` 디렉터리**에서 PowerShell을 연다. 실제 기준 파일은 [STUDENT_RUNBOOK.md](STUDENT_RUNBOOK.md), [STUDENT_LAUNCH_GUIDE.md](STUDENT_LAUNCH_GUIDE.md), `../package.json`이 아닌 **`on-client/package.json`**이다.

```powershell
# 새 Git 최상위에서 실행
Set-Location .\on-client
Get-Location
node --version
Test-Path .\package.json
Test-Path .\student\extension.mjs
Test-Path .\tools\start-alekov.ps1
npm run check
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1
```

- `node --version`: `on-client/package.json` 선언은 `>=22.0.0 <25.0.0`, 제공 PowerShell 실행기 허용 범위는 Node 22~24, 권장 기준은 **v24.19.0**이다. 실제 사용 버전과 환경별 실행 결과를 따로 확인해 기록한다.
- `npm run check`: `node --check student/extension.mjs`이며 **학생 모듈 구문 검사만 수행**한다. 기능/실계정 테스트 아님.
- `on-client/package.json`에는 외부 `dependencies`가 없으며 전용 `package-lock.json`도 확인되지 않았다. 따라서 루트 프로젝트용 `npm ci`를 학생 앱의 필수 절차로 잘못 포함하지 않는다.
- 제공 시작 도구의 성공 신호: `케셰브가 켜졌습니다. 브라우저에서 http://127.0.0.1:5189/ 을 여세요.` 및 `서버가 응답한 것만 확인했습니다. AI 연결 상태는 화면에서 따로 확인해 주세요.`. 이는 **로컬 HTTP 시작 신호**이지 운영 보안 서비스 연결 성공이 아니다.
- 브라우저: `http://127.0.0.1:5189/`에서 「보호 현황」·「업무 앱」·「보안 기록」 및 학생 표시 칸을 확인한다. 5189 포트 충돌 시 먼저 다른 프로세스는 그대로 두고 `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1 -Port 5190`을 사용한 다음 브라우저도 `http://127.0.0.1:5190/`으로 연다.
- **종료:** 실행 PowerShell 창에서 `Ctrl+C`. 로컬 서버 응답이 중단되는지 확인한다.
- **재실행:** 똑같은 새 `on-client` 폴더에서 같은 시작 명령을 다시 실행하고 동일 SHA·메뉴·상태가 유지되는지 확인한다.
- **예제:** `npm run demo`는 합성 사건/계정이며 실제 SDP·AI 승인 성공의 증거가 아니다. 업무 조치를 실제로 시험 집행하지 않는다.
- 기본 앱은 **disconnected**다. 운영자가 허가한 native 및 SDP 설정이 제공되지 않았다면 실제 로그인·판정·보안 기록 조회는 「연결 없음/확인 불가」로 남긴다.
- 에러나 예외가 있으면 명령·시각·비밀 없는 오류 코드·기대값·실제값을 아래 표에 기록한다. 비밀번호, JWT, 기기 개인키, 인증서 원문은 포함하지 않는다.

## 4. 단일 최종 커밋 13~21단계 재현 결과표

**표 작성 규칙:** 결과는 `재현됨 / 재현 안 됨 / 연결 없음 / 확인 불가(미확인)` 중 관찰에 맞는 값을 적는다. **아직 실행하지 않은 시험은 전부 ‘확인 불가(미확인)’**로 적는다. `원문 확인`은 코드가 존재함을 뜻할 뿐 새 환경 실행 성공이 아니다. 새 Windows 환경에서 학생이 직접 확인한 뒤 결과·실제 확인 시각·비밀 없는 로그/캡처 식별자를 갱신한다.

| 단계 | 확인할 기능 | 새 환경 실행 결과 | 실행 확인 시각 / 원문 검토 시각 | 원문 근거 | 미확인 사유 / 후속 검사 |
| --- | --- | --- | --- | --- | --- |
| 13 | `renderIdentity` 사용자·기기·세션 정상/실패/unknown | 확인 불가(미확인) | **Windows 미실행** / 원문 검토 2026-10-26 10:18 KST | `student/extension.mjs` | 운영 SDP 신원, Windows 화면 미검증 |
| 14 | `renderDecision` allow/deny/challenge/unknown 및 이유 | 확인 불가(미확인) | **Windows 미실행** / 원문 검토 2026-10-26 10:18 KST | `student/extension.mjs`, `public/app.js` | 실제 업무 앱 판정 미호출 |
| 15 | `renderEvents` 보안 사건·근거·규칙·새로고침 | 확인 불가(미확인) | **Windows 미실행** / 원문 검토 2026-10-26 10:18 KST | `student/extension.mjs` | 운영 사건 데이터 접근 미확인 |
| 16 | `renderStatus` 연결 없음·에러 안내 및 알림 | 확인 불가(미확인) | **Windows 미실행** / 원문 검토 2026-10-26 10:18 KST | `student/extension.mjs` | 학생 UI 실제 응답 미확인 |
| 17 | `renderAiConnection` ALEPH 계정·AI 앱 별도 승인/모델 조회 | 확인 불가(미확인) | **Windows 미실행** / 원문 검토 2026-10-26 10:18 KST | `student/extension.mjs`, `docs/AI_SETUP_GUIDE.md` | 실계정/앱 승인·모델 조회 미실행 |
| 18 | `renderExplanation` AI 사건 설명과 근거·규칙·unknown | 확인 불가(미확인) | **Windows 미실행** / 원문 검토 2026-10-26 10:18 KST | `student/extension.mjs` | 원천 사건-계정 대응/유료 AI 설명 미확인 |
| 19 | `renderAction` 준비·사람 확인·ACK·결과 관측 분리 | 확인 불가(미확인) | **Windows 미실행** / 원문 검토 2026-10-26 10:18 KST | `student/extension.mjs`, `public/app.js` | `supportedActions=[]`; 운영 집행기 미연결, 실행 시험 금지 |
| 20 | `renderVulnerabilities` lock 버전·OSV 결과·부분 실패·취소 | 확인 불가(미확인) | **Windows 미실행** / 원문 검토 2026-10-26 10:18 KST | `student/extension.mjs`, `src/vulnerabilities/project-scan.mjs` | 운영 허용 목록/실제 설치 메타데이터 대조·OSV 응답 미확인 |
| 21 | 실행 설명서와 텍스트 시스템 구성도·오류 안내 | 확인 불가(미확인) | **Windows 미실행** / 원문 검토 2026-10-26 10:18 KST | `docs/STUDENT_RUNBOOK.md` | 내용은 원문 확인, 새 환경에서 절차 재현 미실행 |

**공통 재현 검사:** 로컬 서버 시작 → 브라우저 첫 화면 → 메뉴 이동 → 상태/오류 문구 → 수동 새로고침 → 중단 → 종료 → 같은 SHA로 재실행을 한 번의 **동일한 최종 소스**로 확인한다. 입력 모드(`demo`/기본/운영 연결), 확인 시각, 로그 식별자를 각 결과 옆에 기록한다. 브라우저가 표시됐어도 서버가 `disconnected`면 해당 운영 기능은 재현됨이 아니라 **연결 없음**이다.

### 코드 읽기·이전 모의 테스트·실제 재현을 구분한 증거

| 관찰 종류 | 이번 단계에서 확인한 것 | 재현 증거로서의 제한 |
| --- | --- | --- |
| 원문 확인 | GitHub 21단계 기준 커밋에 `student/extension.mjs`의 13~20단계 함수와 `docs/STUDENT_RUNBOOK.md`, 실행기, `package.json`이 존재 | 코드·문서 존재는 실제 실행 성공이 아님 |
| 이전 단계의 모의 데이터 검사 | 단계별 개별 브랜치에서 수행했다는 개발 기록이 있음 | **22단계 최종 커밋을 새 환경에서 실행한 결과로 합산하지 않음** |
| 22단계 완성 커밋 독립 새 폴더 실행 | **미실행**. 작업 환경에서 GitHub `git ls-remote`가 DNS 이름 확인 실패로 끝남(2026-10-26); 실제 Windows `git clone`·앱 시작 미실행 | 새 Windows 환경 검사 완료 아님 |
| 운영 SDP/ALEPH/CLCO/OSV/실집행 | 이번 단계에서 인증·외부 AI·패키지 OSV·조치 POST 미실행 | **미확인(UNV)** |

## 5. 데이터 보존·백업·복구 범위와 절차

1. **코드 보존:** 원래 저장소와 기존 브랜치, 미커밋 수정, 1~12단계 BYTE BACK 자료실/서버, 13~21단계 학생 파일, README/문서를 지우거나 변경하지 않는다. 재현은 **새 빈 폴더의 별도 clone**에서만 수행한다. Git의 확인된 40자리 SHA는 코드 복원 기준이며, 실행 환경의 개인 데이터 백업을 대신하지 않는다.
2. **사전 기록:** 학생 PC에서 원래 저장소의 `git status --short`, `git rev-parse HEAD`와 새 폴더의 동일 값을 각각 확인해 충돌이나 혼동이 없는지 기록한다. 미커밋 파일은 기존 위치 그대로 두고, 백업이 필요하면 학생이 허가된 별도 보관 위치를 선택한다. 파일을 옮기거나 Git을 강제 초기화하지 않는다.
3. **비밀·인증 자격:** `.env`, SDP 인증서/개인키, native 보관함, 실제 DB 접속 자격, 기기 인증키는 새 폴더로 무작정 복사하거나 Git에 넣지 않는다. 운영자가 승인한 개인 설정을 새 환경에서 별도로 검증·발급한 뒤 그 설정 경로만 사용한다. 개인 자격이 없다면 **미연결/미확인**을 그대로 기록한다.
4. **데이터 보존:** 루트 BYTE BACK 서비스의 데이터는 별도 운영 DB/API에 있으므로 코드를 clone한 것만으로 데이터가 복제되지 않는다. 이 22단계에서는 DB를 수정하거나 백업·복원했다고 주장하지 않는다. 보존·복원은 운영자가 승인한 기존 [STAGE12_OPERATIONS.md](../../docs/STAGE12_OPERATIONS.md) 및 실제 검증된 백업/권한 절차를 참고한다. 승인받지 않은 자동 복원·기기 승인·실제 보안 조치를 실행하지 않는다.
5. **문제 발생 시 되돌리기:** 테스트용 새 디렉터리를 지우거나 덮어쓰기보다 우선 오류 원인과 SHA를 기록한다. 수정할 필요가 있다면 기존 소스에서 별도 새 커밋으로 고친 뒤 **새 최종 SHA 기준으로 13~21단계 표를 처음부터 다시 검증**한다. 예전 커밋의 성공을 신버전 결과로 재사용하지 않는다.
6. **복원 검증:** 데이터 복원은 백업 존재뿐 아니라 소유자·대상·무결성·접근 권한을 확인해야 한다. 실제 원격 DB 복구, 장치 승인, 키 이전은 이 문서에 포함된 자동 명령이 아니다. 백업 존재·무결성 및 복원 성공은 **실환경 미확인**이다.

## 6. 남은 기능·완료 조건·제출 방식

- **완료로 주장할 수 있는 것:** 학생 단계별 표시 코드와 21단계 실행 문서의 **원문 존재** 및 22단계 재현 **절차·기록 양식 작성**.
- **미완료/UNV:** 새 Windows 폴더에서 최종 SHA 설치·실행·종료·재실행, 같은 소스의 13~21 누적 실제 화면, 학생 운영 SDP 계정·사건 데이터, ALEPH AI 별도 승인·모델 응답, 18단계 사건-사용자 신원 결속, 19단계 실제 보안 조치 집행과 서버 관측, 20단계 설치 메타데이터-OSV 실조회, 기존 데이터의 실제 백업/복원, 21·22단계 공식 AI 수용.
- **릴리스 상태:** `검증 중`이다. Node 엔진 버전 선언은 22~24이며 권장 24.19.0이다. 모든 Windows/Node 조합을 실제 시험했다고 주장하지 않는다. `v1.0`은 19단계 실제 실행 연결과 22단계 **같은 최종 소스**의 누적 재현 및 공식 접수·수용이 완료된 경우에만 표시한다. 지금은 붙이지 않는다.
- **과제 판정:** ALEPH 서버 AI는 제출한 커밋의 **코드/문서 원문**을 읽어 판정한다. 사용자의 이 재현 표는 관찰 진술이며 **서버가 Windows에서 실제 명령을 실행했다는 증거가 아니다**.
- **22단계 제출:** 13~20용 워크벤치 「포털 제출 준비」 대신 해당 22단계 화면에 **저장소 URL + 실제 40자리 최종 커밋**을 직접 기재한다. 비공개 저장소는 공개할 필요가 없으며 화면의 「비공개 저장소 원문 준비 방법」을 따른다. `student-source-cli.mjs`의 실제 옵션·도구 경로는 포털에 표시된 명령을 확인한 뒤 학생 Git 최상위에서 실행한다. 임의의 실행 옵션을 만들거나 실제 제출을 대신하지 않는다.

관련 원문: [학생 실행/구성도](STUDENT_RUNBOOK.md), [제공 실행 안내](STUDENT_LAUNCH_GUIDE.md), [연결 오류](CONNECTION_TROUBLESHOOT.md), [AI 설정](AI_SETUP_GUIDE.md), [단계 프롬프트](STUDENT_PROMPTS.md), [BYTE BACK 데이터·운영 기록](../../docs/STAGE12_OPERATIONS.md).
