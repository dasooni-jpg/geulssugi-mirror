# ─────────────────────────────────────────────────────────────
#  우리 반 교실 꾸미기 — Cloudflare Worker 만들기
#  classroom/index.html + classroom/game.js + classroom/mascot.png
#      + classroom-worker.template.js  →  classroom-worker.js
#  실행:  powershell -ExecutionPolicy Bypass -File build-classroom-worker.ps1
#  그 뒤 classroom-worker.js 전체를 Cloudflare Worker 편집기에 붙여넣고 Deploy
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Read-Utf8($path) { [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }

# 템플릿 문자열(`...`) 안에 안전하게 넣기 위한 escape
function Escape-ForTemplateLiteral($s) {
  $s = $s.Replace('\', '\\')
  $s = $s.Replace('`', '\`')
  $s = $s.Replace('${', '\${')
  return $s
}

$html = Escape-ForTemplateLiteral (Read-Utf8 (Join-Path $root "classroom\index.html"))
$game = Escape-ForTemplateLiteral (Read-Utf8 (Join-Path $root "classroom\game.js"))
$tpl  = Read-Utf8 (Join-Path $root "classroom-worker.template.js")
$mascotB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root "classroom\mascot.png")))

$out = $tpl.Replace('__APP_HTML__', ('`' + $html + '`'))
$out = $out.Replace('__GAME_JS__',  ('`' + $game + '`'))
$out = $out.Replace('__MASCOT_B64__', $mascotB64)

$dest = Join-Path $root "classroom-worker.js"
[IO.File]::WriteAllText($dest, $out, (New-Object Text.UTF8Encoding $false))

Write-Host "OK: $dest ($([Math]::Round((Get-Item $dest).Length/1KB)) KB)"
Write-Host "-> 이 파일 전체를 Cloudflare Worker 편집기에 붙여넣고 Deploy 하세요."
Write-Host "-> 배포 후 https://<워커주소>/health 가 ok 를 보이면 정상입니다."
