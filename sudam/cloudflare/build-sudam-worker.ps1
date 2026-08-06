# ─────────────────────────────────────────────────────────────
#  수담(數談) 음성 입력 — Cloudflare Worker builder
#  ../index.html + sudam-worker.template.js → sudam-worker.js
#  Run:  powershell -ExecutionPolicy Bypass -File build-sudam-worker.ps1
#        (이 스크립트는 sudam/cloudflare/ 안에서 실행합니다)
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$appRoot = Split-Path $here -Parent   # → sudam/

function Read-Utf8($path) { [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }

# escape for JS template literal
function Escape-ForTemplateLiteral($s) {
  $s = $s.Replace('\', '\\')
  $s = $s.Replace('`', '\`')
  $s = $s.Replace('${', '\${')
  return $s
}

$app = Escape-ForTemplateLiteral (Read-Utf8 (Join-Path $appRoot "index.html"))
$tpl = Read-Utf8 (Join-Path $here "sudam-worker.template.js")

$out = $tpl.Replace('__APP_HTML__', ('`' + $app + '`'))

$dest = Join-Path $here "sudam-worker.js"
[IO.File]::WriteAllText($dest, $out, (New-Object Text.UTF8Encoding $false))

Write-Host "OK: $dest ($([Math]::Round((Get-Item $dest).Length/1KB)) KB)"
Write-Host "-> Cloudflare Worker 편집기에 sudam-worker.js 전체를 붙여넣고 Deploy 하세요."
Write-Host "-> Settings > Variables and Secrets 에서 OPENAI_API_KEY, ANTHROPIC_API_KEY(Secret) 를 넣으세요."
