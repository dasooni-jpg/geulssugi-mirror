# ─────────────────────────────────────────────────────────────
#  매일 영단어 30 — Cloudflare Worker builder
#  engword-app/app.html + engword-worker.template.js → engword-worker.js
#  Run:  powershell -ExecutionPolicy Bypass -File build-engword-worker.ps1
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

$app = Escape-ForTemplateLiteral (Read-Utf8 (Join-Path $root "engword-app\app.html"))
$tpl = Read-Utf8 (Join-Path $root "engword-worker.template.js")

$out = $tpl.Replace('__APP_HTML__', ('`' + $app + '`'))

$dest = Join-Path $root "engword-worker.js"
[IO.File]::WriteAllText($dest, $out, (New-Object Text.UTF8Encoding $false))

# copy for the browser test harness (engword-app/_test.html)
Copy-Item $dest (Join-Path $root "engword-app\_worker.js") -Force

Write-Host "OK: $dest ($([Math]::Round((Get-Item $dest).Length/1KB)) KB)"
Write-Host "-> Paste the whole file into the Cloudflare Worker editor and Deploy."
Write-Host "-> Verify: run engword-server.ps1 then open http://localhost:4220/_test.html (all PASS)"
