<#
HORSE one-click startup from ZIP or Git checkout.
- Never edits submissions or deletes an existing process.
- Git auto-update runs only for the expected clean checkout; ZIP runs directly.
- Reuses a running server only when its served UI files match this folder.
- On collision, uses a free loopback port rather than opening an older server.
- Windows PowerShell 5.1 compatible. No admin permissions.
#>
[CmdletBinding()]
param(
  [ValidateRange(1024, 65520)][int]$Port = 5189,
  [switch]$NoBrowser
)
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$app = Join-Path $repo 'on-client'
$starter = Join-Path $PSScriptRoot 'start-alekov.ps1'
$branch = 'work/horse-pc-dashboard-20261028'
$expectedOrigin = 'https://github.com/dfdfewqk/choi-bujang-secret-vault.git'

function Stop-Horse([string]$message) {
  Write-Host "[HORSE] $message" -ForegroundColor Yellow
  exit 1
}
function Read-Git([string[]]$argsToGit) {
  $value = & git @argsToGit 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'GIT_QUERY_FAILED' }
  return ($value | Out-String).Trim()
}
function Update-Checkout {
  if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) {
    Write-Host '[HORSE] ZIP 폴더 실행: Git 설치나 업데이트는 필요 없습니다.'
    return
  }
  if (-not (Get-Command git -CommandType Application -ErrorAction SilentlyContinue)) {
    Write-Host '[HORSE] Git을 찾을 수 없어 이 폴더에 저장된 버전으로 실행합니다.'
    return
  }
  try {
    $origin = Read-Git -argsToGit @('-C',$repo,'remote','get-url','origin')
    $active = Read-Git -argsToGit @('-C',$repo,'branch','--show-current')
    if ($origin -ne $expectedOrigin -or $active -ne $branch) {
      Write-Host '[HORSE] 다른 저장소 또는 브랜치이므로 자동 업데이트는 건너뜁니다.'
      return
    }
    $dirty = Read-Git -argsToGit @('-C',$repo,'status','--porcelain')
    if (-not [string]::IsNullOrWhiteSpace($dirty)) {
      Write-Host '[HORSE] 로컬 수정 파일이 있어 자동 업데이트를 건너뜁니다.'
      return
    }
    Write-Host '[HORSE] GitHub 최신 버전을 확인합니다...'
    & git -C $repo fetch --quiet --no-tags origin $branch 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '[HORSE] 네트워크 문제로 업데이트를 건너뜁니다. 로컬 버전을 실행합니다.'
      return
    }
    & git -C $repo merge --ff-only FETCH_HEAD 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '[HORSE] 업데이트가 fast-forward가 아니어서 파일을 덮어쓰지 않았습니다.'
      return
    }
    Write-Host '[HORSE] GitHub 최신 버전 확인 완료.'
  } catch {
    Write-Host '[HORSE] Git 업데이트를 확인할 수 없어 저장된 버전으로 실행합니다.'
  }
}
function Is-Occupied([int]$number) {
  $probe=$null
  try {
    $probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$number)
    $probe.Start()
    return $false
  } catch {
    return $true
  } finally {
    if ($null -ne $probe) { $probe.Stop() }
  }
}
function Matches-This-App([int]$number) {
  # A working response from another folder is not enough to prove it is our current HORSE.
  foreach ($entry in @(
    @('public\index.html','/'),
    @('student\extension.mjs','/student/extension.mjs'),
    @('public\pc-dashboard.js','/pc-dashboard.js'),
    @('public\app.js','/app.js')
  )) {
    try {
      $file = Join-Path $app $entry[0]
      if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return $false }
      $url = 'http://127.0.0.1:' + $number + $entry[1]
      $answer = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3 -ErrorAction Stop
      if ($answer.StatusCode -ne 200) { return $false }
      $local = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
      $remote = ([string]$answer.Content).TrimStart([char]0xFEFF)
      if (-not [string]::Equals($local,$remote,[StringComparison]::Ordinal)) { return $false }
    } catch {
      return $false
    }
  }
  return $true
}
try {
  if (-not (Test-Path -LiteralPath $starter -PathType Leaf)) {
    Stop-Horse '서버 시작 파일이 없습니다. on-client/tools/start-alekov.ps1을 확인하세요.'
  }
  if (-not (Test-Path -LiteralPath (Join-Path $app 'src\server.mjs') -PathType Leaf)) {
    Stop-Horse '프로젝트 폴더 구성이 올바르지 않습니다. ZIP 압축을 완전히 풀었는지 확인하세요.'
  }
  Update-Checkout
  if (-not (Get-Command node -CommandType Application -ErrorAction SilentlyContinue)) {
    Stop-Horse 'Node.js가 설치되지 않았습니다. https://nodejs.org 에서 Node.js 24 LTS를 설치해 주세요.'
  }
  $selected=0
  $reused=$false
  for ($candidate=$Port; $candidate -le ($Port+15); $candidate++) {
    if (-not (Is-Occupied $candidate)) {
      $selected=$candidate
      break
    }
    if (Matches-This-App $candidate) {
      $selected=$candidate
      $reused=$true
      break
    }
  }
  if ($selected -eq 0) {
    Stop-Horse ('로컬 포트 ' + $Port + '~' + ($Port+15) + '가 사용 중입니다. 다른 앱을 강제로 종료하지 않았습니다.')
  }
  $url='http://127.0.0.1:'+$selected+'/'
  if ($reused) {
    Write-Host '[HORSE] 현재 폴더와 동일한 HORSE가 이미 켜져 있습니다.'
  } else {
    Write-Host "[HORSE] 서버를 시작합니다. (포트 $selected)"
    # The official starter is an independent subprocess because it calls exit.
    # Background mode keeps only this project's Node server running, without a second console.
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $starter -Port $selected -Background -WaitSeconds 30
    if ($LASTEXITCODE -ne 0) {
      Stop-Horse '서버 시작에 실패했습니다. 위에 출력된 이유와 Node.js 버전을 확인하세요.'
    }
    if (-not (Matches-This-App $selected)) {
      Stop-Horse '서버가 시작됐지만 최신 HORSE 화면을 확인하지 못했습니다. 브라우저를 열지 않습니다.'
    }
  }
  Write-Host "[HORSE] 화면 주소: $url" -ForegroundColor Green
  Write-Host '[HORSE] CPU·메모리·디스크·Windows 조회는 이 로컬 서버에서 진행합니다.'
  Write-Host '[HORSE] SDP·업무 앱·AI 인증은 별도 연결 설정이 없으면 미연결이 정상입니다.'
  if (-not $NoBrowser) {
    try { Start-Process -FilePath $url -ErrorAction Stop }
    catch {
      Stop-Horse ('기본 브라우저를 열지 못했습니다. 주소를 직접 여세요: ' + $url)
    }
  }
  exit 0
} catch {
  Stop-Horse ('예상하지 못한 실행 오류: ' + $_.Exception.Message)
}
