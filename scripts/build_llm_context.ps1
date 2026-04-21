$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location $root

# 結合するファイルを列挙 (プロジェクトに合わせて適宜変更)
$files = @(
  "index.html",
  "sw.js",
  "assets/constants.js",
  "assets/config.js",
  "assets/storage.js",
  "assets/cloudSync.js",
  "assets/app.js",
  "assets/reader.js",
  "assets/ui.js",
  "assets/style.css",
  "docs/CORE_PRINCIPLES.md",
  "docs/SSOT_GUIDE.md",
  "docs/MODULE_GUIDE.md",
  "docs/COMMENT_GUIDE.md",
  "docs/REFACTOR_GUIDE.md",
  "docs/CSS_GUIDE.md"
)

function Get-Lang([string]$f) {
  if ($f.EndsWith(".html")) { return "html" }
  if ($f.EndsWith(".css")) { return "css" }
  if ($f.EndsWith(".sql")) { return "sql" }
  if ($f.EndsWith(".json")) { return "json" }
  if ($f.EndsWith(".md")) { return "markdown" }
  return "javascript"
}

$fileListMd = ($files | ForEach-Object { "- ``$_``" }) -join "`n"
$headerPath = Join-Path $root "scripts\LLM_CONTEXT_header.md"
if (-not (Test-Path -LiteralPath $headerPath)) { throw "Header template not found: $headerPath" }

$headerUtf8 = [System.Text.UTF8Encoding]::new($false)
$headerTemplate = [System.IO.File]::ReadAllText($headerPath, $headerUtf8)
$header = $headerTemplate.Replace("{{FILE_LIST}}", $fileListMd)

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append($header)

foreach ($rel in $files) {
  $abs = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $abs)) { Write-Warning "Skip missing file: $rel"; continue }
  $body = [System.IO.File]::ReadAllText($abs, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n")
  $lang = Get-Lang $rel
  [void]$sb.Append("### $rel`n`n```$lang`n$body`n````n`n")
}

$outPath = Join-Path $root "LLM_CONTEXT.md"
[System.IO.File]::WriteAllText($outPath, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "Success: Generated LLM_CONTEXT.md"
