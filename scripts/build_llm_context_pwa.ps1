$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location $root

# PWAに関係する重要なファイルを厳選
$pwaFiles = @(
  "manifest.json",
  "sw.js",
  "index.html",
  "assets/sw-cache-config.json",
  "assets/constants.js",
  "assets/config.js",
  "assets/constants/pwa.js",
  "assets/constants/app-info.js",
  "assets/constants/runtime-config.js",
  "assets/app.js",
  "assets/ui.js",
  "assets/storage.js",
  "docs/CORE_PRINCIPLES.md",
  "FULLSCREEN_REPAGINATION_DEBUG.md"
)

function Get-Lang([string]$f) {
  if ($f.EndsWith(".html")) { return "html" }
  if ($f.EndsWith(".css")) { return "css" }
  if ($f.EndsWith(".sql")) { return "sql" }
  if ($f.EndsWith(".json")) { return "json" }
  if ($f.EndsWith(".md")) { return "markdown" }
  return "javascript"
}

$fileListMd = ($pwaFiles | ForEach-Object { "- ``$_``" }) -join "`n"
$headerPath = Join-Path $root "scripts\LLM_CONTEXT_header.md"
$headerUtf8 = [System.Text.UTF8Encoding]::new($false)

if (Test-Path -LiteralPath $headerPath) {
    $headerTemplate = [System.IO.File]::ReadAllText($headerPath, $headerUtf8)
    $header = $headerTemplate.Replace("# LLM向けプロジェクト・コンテキスト", "# LLM向け PWA・コンテキスト")
    $header = $header.Replace("{{FILE_LIST}}", $fileListMd)
} else {
    $header = "# LLM向け PWA・コンテキスト`n$fileListMd`n---`n"
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append($header)
[void]$sb.Append("`n> [!NOTE]`n> このファイルはPWAおよび画面制御（リサイズ/全画面）に関連するコードのみを抽出した軽量版です。`n`n---`n`n")

Write-Host "Aggregating $($pwaFiles.Count) files..."

foreach ($rel in $pwaFiles) {
  $abs = Join-Path $root $rel.Replace("/", "\")
  if (-not (Test-Path -LiteralPath $abs)) { Write-Warning "Skip missing file: $rel"; continue }
  $body = [System.IO.File]::ReadAllText($abs, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n")
  $lang = Get-Lang $rel
  [void]$sb.Append("### $rel`n`n```$lang`n$body`n````n`n")
}

$outPath = Join-Path $root "LLM_CONTEXT_PWA.md"
[System.IO.File]::WriteAllText($outPath, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "Success: Generated LLM_CONTEXT_PWA.md ($($pwaFiles.Count) files)"
