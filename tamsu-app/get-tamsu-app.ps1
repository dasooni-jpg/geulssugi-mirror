# ─────────────────────────────────────────────────────────────
#  탐수학 · 최신 app.html 받아오기
#  GitHub(claude/missing-semester-back-button-ybdepc 브랜치)에서
#  tamsu-app/app.html 을 내려받아 이 폴더의 tamsu-app\app.html 을 바꾼다.
#
#  Run:  powershell -ExecutionPolicy Bypass -File get-tamsu-app.ps1
#
#  하는 일
#   1) 지금 app.html 을 app.html.bak-날짜시각 으로 백업
#   2) 새 app.html 내려받아 덮어쓰기 (내려받기 실패하면 아무것도 건드리지 않음)
#   3) _test.html 의 '단원 수 54개' 검사를 108개로 고침
#   4) build-tamsu-worker.ps1 을 이어서 실행할지 물어봄
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$url  = "https://raw.githubusercontent.com/dasooni-jpg/geulssugi-mirror/claude/missing-semester-back-button-ybdepc/tamsu-app/app.html"
$dest = Join-Path $root "tamsu-app\app.html"

if (-not (Test-Path (Join-Path $root "tamsu-app"))) {
  Write-Host "! 이 폴더에 tamsu-app 폴더가 없습니다. 탐수학 작업 폴더에서 실행해 주세요." -ForegroundColor Red
  exit 1
}

Write-Host "내려받는 중..." -NoNewline
$tmp = Join-Path $env:TEMP ("tamsu-app-" + [Guid]::NewGuid().ToString("N") + ".html")
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
$size = (Get-Item $tmp).Length
if ($size -lt 100KB) {
  Write-Host " 실패" -ForegroundColor Red
  Write-Host "! 내려받은 파일이 너무 작습니다($size 바이트). 원래 파일은 그대로 두었습니다." -ForegroundColor Red
  Remove-Item $tmp -Force
  exit 1
}
Write-Host (" 완료 (" + [Math]::Round($size/1KB) + " KB)")

# 1) 백업
if (Test-Path $dest) {
  $bak = "$dest.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  Copy-Item $dest $bak -Force
  Write-Host "백업: $bak"
}

# 2) 덮어쓰기
Move-Item $tmp $dest -Force
Write-Host "OK: $dest 를 새 파일로 바꿨습니다."

# 3) _test.html 의 단원 수 검사 고치기 (54 -> 108)
$test = Join-Path $root "tamsu-app\_test.html"
if (Test-Path $test) {
  $t = [IO.File]::ReadAllText($test, [Text.Encoding]::UTF8)
  if ($t -match "unitCount === 54") {
    $t = $t.Replace("unitCount === 54", "unitCount === 108").Replace("단원 수 54개", "단원 수 108개")
    [IO.File]::WriteAllText($test, $t, (New-Object Text.UTF8Encoding $false))
    Write-Host "OK: _test.html 의 단원 수 검사를 108개로 고쳤습니다."
  }
}

# 4) 이어서 빌드
$build = Join-Path $root "build-tamsu-worker.ps1"
if (Test-Path $build) {
  Write-Host ""
  $yn = Read-Host "이어서 build-tamsu-worker.ps1 을 실행할까요? (Y/N)"
  if ($yn -match '^[Yy]') {
    & powershell -ExecutionPolicy Bypass -File $build
  } else {
    Write-Host "-> 나중에 직접 실행: powershell -ExecutionPolicy Bypass -File build-tamsu-worker.ps1"
  }
}

Write-Host ""
Write-Host "다음 순서" -ForegroundColor Cyan
Write-Host " 1. build-tamsu-worker.ps1 실행 -> tamsu-app\tamsu-worker.js 생성"
Write-Host " 2. tamsu-worker.js 전체를 Cloudflare Worker 편집기에 붙여넣고 Deploy"
Write-Host " 3. 앱에서 공부하기 탭 -> 학년 아래 '학기' 줄에서 1학기/2학기 확인"
