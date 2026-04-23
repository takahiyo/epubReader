$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location $root

# 除外パターンの定義
$excludePatterns = @(
    "node_modules",
    ".git",
    ".wrangler",
    ".gemini",
    "assets/vendor",
    "assets/animations",
    "temp_test_",
    "LLM_CONTEXT.md",
    "epub_file_handler_full.js",
    "epub_file_handler_head.txt"
)

# ファイルを動的に収集
Write-Host "Searching for files..."
$allItems = Get-ChildItem -Path $root -Recurse -File | Where-Object {
    $rel = (Resolve-Path -Path $_.FullName -Relative).Replace(".\", "").Replace("\", "/")
    
    # 拡張子のチェック
    $isValidExt = $_.Extension -match "\.(js|css|html|json|md|sql)$"
    
    # 除外パターンのチェック
    $isExcluded = $false
    foreach ($p in $excludePatterns) {
        if ($rel -like "*$p*") {
            $isExcluded = $true
            break
        }
    }
    
    $isValidExt -and -not $isExcluded
}

$files = $allItems | ForEach-Object { (Resolve-Path -Path $_.FullName -Relative).Replace(".\", "").Replace("\", "/") }
$files = $files | Sort-Object

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

Write-Host "Aggregating $($files.Count) files..."

foreach ($rel in $files) {
  $abs = Join-Path $root $rel.Replace("/", "\")
  if (-not (Test-Path -LiteralPath $abs)) { Write-Warning "Skip missing file: $rel"; continue }
  $body = [System.IO.File]::ReadAllText($abs, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n")
  $lang = Get-Lang $rel
  [void]$sb.Append("### $rel`n`n```$lang`n$body`n````n`n")
}

$outPath = Join-Path $root "LLM_CONTEXT.md"
[System.IO.File]::WriteAllText($outPath, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "Success: Generated LLM_CONTEXT.md ($($files.Count) files)"
