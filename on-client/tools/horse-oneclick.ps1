<#
 HORSE single-click launcher (no installer, no packaging).
 Requires a one-time Git clone. This script never alters submitted ZIP folders.
 It runs Git fast-forward only, then launches the existing on-client starter.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
$branch = 'work/horse-pc-dashboard-20261028'
$origin = 'https://github.com/dfdfewqk/choi-bujang-secret-vault.git'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$app = Join-Path $repo 'on-client'
$starter = Join-Path $PSScriptRoot 'start-alekov.ps1'
$url = 'http://127.0.0.1:5189/'
function Stop-Horse([string]$message, [int]$code = 1) {
  Write-Host $message -ForegroundColor Yellow
  exit $code
}
function GitValue([string[]]$gitArgs) {
  $output = & git @gitArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw ('GIT_COMMAND_FAILED: ' + ($output -join ' ')) }
  return ($output | Out-String).Trim()
}
function Is-Listening {
  $listener = $null
  try {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 5189)
    $listener.Start()
    return $false
  } catch {
    return $true
  } finally {
    if ($null -ne $listener) { $listener.Stop() }
  }
}
function Is-Horse-Page {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 -ErrorAction Stop
    return $response.StatusCode -eq 200 -and $response.Content.Contains('id="pc-dashboard"')
  } catch {
    return $false
  }
}
if (-not (Test-Path -LiteralPath $starter -PathType Leaf)) {
  Stop-Horse 'HORSE 실행 파일이 없습니다. on-client/tools/start-alekov.ps1 을 확인해 주세요.'
}
if (-not (Get-Command git -CommandType Application -ErrorAction SilentlyContinue)) {
  Stop-Horse 'Git 이 설치되어 있지 않습니다. https://git-scm.com/downloads/win 에서 설치한 뒤 다시 실행하세요.'
}
if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) {
  Stop-Horse '이 폴더는 ZIP 복사본입니다. Git으로 한 번만 복제한 HORSE 폴더에서 실행하세요.'
}
$actualOrigin = GitValue @('-C', $repo, 'remote', 'get-url', 'origin')
if ($actualOrigin -ne $origin) {
  Stop-Horse 'HORSE 원본 GitHub 주소가 예상과 다릅니다. 자동 업데이트를 수행하지 않습니다.'
}
$active = GitValue @('-C', $repo, 'branch', '--show-current')
if ($active -ne $branch) {
  Stop-Horse ('현재 Git 브랜치가 HORSE 작업 브랜치가 아닙니다: ' + $active)
}
# Never terminate an already running app.
if (Is-Listening) {
  if (Is-Horse-Page) {
    Write-Host '기존 HORSE가 실행 중입니다. 현재 화면을 엽니다. 새 코드를 적용하려면 기존 서버를 먼저 종료하세요.'
    Start-Process $url
    exit 0
  }
  Stop-Horse '5189 포트를 다른 프로그램이 사용 중입니다. 기존 프로그램을 종료하지 않습니다.'
}
$dirty = GitValue @('-C', $repo, 'status', '--porcelain', '--untracked-files=no')
if (-not [string]::IsNullOrWhiteSpace($dirty)) {
  Write-Host '로컬 수정 파일이 있어 GitHub 업데이트를 건너뜁니다. 현재 버전으로 실행합니다.' -ForegroundColor Yellow
} else {
  Write-Host 'GitHub 새 버전 확인 중...'
  try {
    $fetch = & git -C $repo fetch --quiet --no-tags origin $branch 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'GitHub 연결 실패. 설치된 로컬 버전으로 실행합니다.' -ForegroundColor Yellow
    } else {
      $merge = & git -C $repo merge --ff-only FETCH_HEAD 2>&1
      if ($LASTEXITCODE -ne 0) {
        Write-Host 'Git 기록에 충돌이 있어 자동 업데이트를 건너뜁니다. 파일을 강제로 덮어쓰지 않습니다.' -ForegroundColor Yellow
      } else {
        Write-Host 'GitHub 버전 확인 및 업데이트 완료.'
      }
    }
  } catch {
    Write-Host '자동 업데이트에 실패해 로컬 버전으로 실행합니다. 파일을 강제로 덮어쓰지 않습니다.' -ForegroundColor Yellow
  }
}
if (-not (Get-Command node -CommandType Application -ErrorAction SilentlyContinue)) {
  Stop-Horse 'Node.js 22~24 가 없습니다. Node.js 24 LTS를 설치해 주세요.'
}
Write-Host 'HORSE 서버를 실행합니다...'
$child = Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $starter + '"') -WorkingDirectory $app -PassThru
$ready = $false
$deadline = (Get-Date).AddSeconds(25)
while ((Get-Date) -lt $deadline) {
  if (Is-Horse-Page) { $ready = $true; break }
  if ($child.HasExited) { break }
  Start-Sleep -Milliseconds 400
}
if (-not $ready) {
  Stop-Horse '앱 서버가 시작되지 않았습니다. 새 PowerShell 창의 오류를 확인하세요. 기존 프로세스를 강제 종료하지 않습니다.'
}
Write-Host 'HORSE가 실행됐습니다. 브라우저를 엽니다.'
Start-Process $url
