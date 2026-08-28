# ─────────────────────────────────────────────────────────────
#  안전교육 문구 복사기 — Cloudflare Worker builder
#  safety-edu-app/app.html + safety-edu-worker.template.js → safety-edu-worker.js
#  Run:  powershell -ExecutionPolicy Bypass -File build-safety-edu-worker.ps1
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Read-Utf8($path) { [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }

# escape for JS template literal
function Escape-ForTemplateLiteral($s) {
  $s = $s.Replace('\', '\\')
  $s = $s.Replace('`', '\`')
  $s = $s.Replace('${', '\${')
  return $s
}

$app = Escape-ForTemplateLiteral (Read-Utf8 (Join-Path $root "safety-edu-app\app.html"))
$tpl = Read-Utf8 (Join-Path $root "safety-edu-worker.template.js")

$out = $tpl.Replace('__APP_HTML__', ('`' + $app + '`'))

$dest = Join-Path $root "safety-edu-worker.js"
[IO.File]::WriteAllText($dest, $out, (New-Object Text.UTF8Encoding $false))

Write-Host "OK: $dest ($([Math]::Round((Get-Item $dest).Length/1KB)) KB)"
Write-Host "-> Paste the whole file into the Cloudflare Worker editor and Deploy."
Write-Host "-> Verify: run safety-edu-server.ps1 then open http://localhost:4230/ (같은 화면·같은 API 모양)"
