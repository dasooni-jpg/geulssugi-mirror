# ─────────────────────────────────────────────────────────────
#  학급은행 Cloudflare Worker builder
#  bank-app/index.html + bank-app/teacher.html + bank-worker.template.js → bank-worker.js
#  Run:  powershell -ExecutionPolicy Bypass -File build-bank-worker.ps1
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

$student = Escape-ForTemplateLiteral (Read-Utf8 (Join-Path $root "bank-app\index.html"))
$teacher = Escape-ForTemplateLiteral (Read-Utf8 (Join-Path $root "bank-app\teacher.html"))
$tpl = Read-Utf8 (Join-Path $root "bank-worker.template.js")
$mascotB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root "bank-app\mascot.png")))

$out = $tpl.Replace('__STUDENT_HTML__', ('`' + $student + '`'))
$out = $out.Replace('__TEACHER_HTML__', ('`' + $teacher + '`'))
$out = $out.Replace('__MASCOT_B64__', $mascotB64)

$dest = Join-Path $root "bank-worker.js"
[IO.File]::WriteAllText($dest, $out, (New-Object Text.UTF8Encoding $false))

Write-Host "OK: $dest ($([Math]::Round((Get-Item $dest).Length/1KB)) KB)"
Write-Host "-> Paste the whole file into the Cloudflare Worker editor and Deploy."
