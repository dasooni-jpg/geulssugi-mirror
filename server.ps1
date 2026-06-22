$root = Join-Path $PSScriptRoot "app"

# ── 사용할 Claude 모델 (교실 비용을 줄이려면 "claude-haiku-4-5" 로 바꾸세요) ──
$MODEL = "claude-opus-4-8"

$prefix = "http://localhost:4173/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix (model: $MODEL)"
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="application/javascript"; ".css"="text/css"; ".json"="application/json" }
Add-Type -AssemblyName System.Net.Http

# ── 본문(JSON)을 UTF-8로 읽기 ──
function Read-Body($ctx) {
  $sr = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
  $t = $sr.ReadToEnd(); $sr.Close(); return $t
}
# ── JSON 응답 보내기 (UTF-8) ──
function Send-Json($ctx, $obj, $status=200) {
  $json = $obj | ConvertTo-Json -Depth 15
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = "application/json; charset=utf-8"
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

# ── API 키 찾기 (환경변수 우선, 없으면 apikey.txt) ──
function Get-ApiKey {
  if ($env:ANTHROPIC_API_KEY) { return $env:ANTHROPIC_API_KEY }
  $f = Join-Path $PSScriptRoot "apikey.txt"
  if (Test-Path $f) { return (Get-Content $f -Raw).Trim() }
  return $null
}

# ── Claude API 호출하여 3색 피드백 받기 ──
function Get-AIFeedback($text, $reader) {
  $apiKey = Get-ApiKey
  if (-not $apiKey) { return @{ ok = $false; reason = "no_key" } }
  $readerTxt = if ([string]::IsNullOrWhiteSpace($reader)) { "이 글을 읽을 사람" } else { $reader }

  $system = @"
너는 초등학교 6학년의 글쓰기를 돕는 다정한 글쓰기 친구야.
규칙: (1) 절대 학생의 문장을 대신 고쳐 주거나 완성해 주지 마.
(2) green 에는 잘한 점 1가지를 구체적으로 칭찬해.
(3) yellow 에는 더 생각해 볼 점을 '질문'으로만 쉽게 안내해. 답은 알려주지 마.
(4) blue 에는 읽는 사람을 떠올리게 하는 메타인지 질문을 1가지 써.
(5) 6학년이 이해할 쉬운 말을 쓰고, 각 항목은 한두 문장으로 짧게.
"@
  $userMsg = "학생이 쓴 글:`n`"`"`"$text`"`"`"`n읽는 사람: $readerTxt`n위 글에 대해 green/yellow/blue 피드백을 만들어 줘."

  $schema = @{
    type = "object"
    properties = @{
      green  = @{ type = "string" }
      yellow = @{ type = "string" }
      blue   = @{ type = "string" }
    }
    required = @("green","yellow","blue")
    additionalProperties = $false
  }
  $bodyObj = @{
    model = $MODEL
    max_tokens = 1024
    system = $system
    messages = @(@{ role = "user"; content = $userMsg })
    output_config = @{ format = @{ type = "json_schema"; schema = $schema } }
  }
  $bodyJson = $bodyObj | ConvertTo-Json -Depth 15

  try {
    $client = New-Object System.Net.Http.HttpClient
    $client.Timeout = [TimeSpan]::FromSeconds(60)
    $content = New-Object System.Net.Http.StringContent($bodyJson, [System.Text.Encoding]::UTF8, "application/json")
    $client.DefaultRequestHeaders.Add("x-api-key", $apiKey)
    $client.DefaultRequestHeaders.Add("anthropic-version", "2023-06-01")
    $resp = $client.PostAsync("https://api.anthropic.com/v1/messages", $content).Result
    $bytes = $resp.Content.ReadAsByteArrayAsync().Result
    $respText = [System.Text.Encoding]::UTF8.GetString($bytes)
    $client.Dispose()
    if ([int]$resp.StatusCode -ne 200) { return @{ ok = $false; reason = "api_$([int]$resp.StatusCode)"; detail = $respText } }
    $parsed = $respText | ConvertFrom-Json
    $cardText = $parsed.content[0].text
    $cards = $cardText | ConvertFrom-Json
    return @{ ok = $true; green = $cards.green; yellow = $cards.yellow; blue = $cards.blue; model = $MODEL }
  } catch {
    return @{ ok = $false; reason = "exception"; detail = $_.Exception.Message }
  }
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.LocalPath)
    $method = $ctx.Request.HttpMethod

    if ($path -eq "/api/feedback" -and $method -eq "POST") {
      $d = Read-Body $ctx | ConvertFrom-Json
      $fb = Get-AIFeedback $d.text $d.reader
      Send-Json $ctx $fb
    }
    else {
      # 정적 파일
      $rel = $path.TrimStart('/')
      if ([string]::IsNullOrEmpty($rel)) { $rel = "index.html" }
      $file = Join-Path $root $rel
      if (Test-Path $file -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
        $ctx.Response.ContentLength64 = $bytes.Length
        if ($method -ne "HEAD") { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $ctx.Response.StatusCode = 404
      }
    }
  } catch {
    try { $ctx.Response.StatusCode = 500 } catch {}
  } finally {
    try { $ctx.Response.Close() } catch {}
  }
}
