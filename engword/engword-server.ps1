# ─────────────────────────────────────────────────────────────
#  매일 영단어 30 — static file server (test harness / preview only)
#  The real app runs on Cloudflare Worker (engword-worker.js).
#  Run:  powershell -ExecutionPolicy Bypass -File engword-server.ps1
#  Then: http://localhost:4220/_test.html
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "engword-app"
$port = 4220

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "engword test server: http://localhost:$port/_test.html"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $p = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($p -eq "/") { $p = "/_test.html" }
    $file = Join-Path $root ($p.TrimStart("/") -replace "/", "\")
    $rootFull = (Resolve-Path $root).Path
    if ((Test-Path $file -PathType Leaf) -and (Resolve-Path $file).Path.StartsWith($rootFull)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
      $ctx.Response.ContentType = $ct
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $b = [Text.Encoding]::UTF8.GetBytes("404")
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
  } catch {}
  try { $ctx.Response.Close() } catch {}
}
