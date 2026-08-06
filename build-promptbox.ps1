# ─────────────────────────────────────────────────────────────
#  선생님 도구상자 — Cloudflare Worker builder
#  promptbox-app/app.html + promptbox-worker.template.js → promptbox-worker.js
#  Run:  powershell -ExecutionPolicy Bypass -File build-promptbox.ps1
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

$app = Escape-ForTemplateLiteral (Read-Utf8 (Join-Path $root "promptbox-app\app.html"))
$tpl = Read-Utf8 (Join-Path $root "promptbox-worker.template.js")
$mascotB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root "promptbox-app\mascot.png")))

$out = $tpl.Replace('__APP_HTML__', ('`' + $app + '`'))
$out = $out.Replace('__MASCOT_B64__', $mascotB64)

$dest = Join-Path $root "promptbox-worker.js"
[IO.File]::WriteAllText($dest, $out, (New-Object Text.UTF8Encoding $false))

# copy for the browser test harness (promptbox-app/_test.html)
Copy-Item $dest (Join-Path $root "promptbox-app\_worker.js") -Force

Write-Host "OK: $dest ($([Math]::Round((Get-Item $dest).Length/1KB)) KB)"
Write-Host "-> Paste the whole file into the Cloudflare Worker editor and Deploy."
Write-Host "-> Verify: run promptbox-server.ps1 then open http://localhost:4240/_test.html (all PASS)"
