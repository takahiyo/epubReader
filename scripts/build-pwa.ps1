<#
.SYNOPSIS
    PWA ビルド → APK署名 → Quest 3 サイドロード
.DESCRIPTION
    1. PWABuilder 経由で unsigned APK を生成（または既存の unsigned APK を署名）
    2. apksigner で v1+v2 署名
    3. 署名検証
    4. adb で Quest 3 にインストール
.PARAMETER PwaUrl
    PWA の URL（例: https://epubreader-7w6.pages.dev）
.PARAMETER UnsignedApkPath
    unsigned APK のパス（指定時は PwaUrl をスキップして署名のみ）
.PARAMETER OutputDir
    出力先ディレクトリ（デフォルト: カレントの build フォルダ）
.PARAMETER NoInstall
    署名後、インストールをスキップ
.EXAMPLE
    .\build-pwa.ps1 -PwaUrl "https://epubreader-7w6.pages.dev"
.EXAMPLE
    .\build-pwa.ps1 -UnsignedApkPath "D:\Download\app-unsigned.apk"
#>

param(
    [string]$PwaUrl = "",
    [string]$UnsignedApkPath = "",
    [string]$OutputDir = (Join-Path $PSScriptRoot "build"),
    [switch]$NoInstall
)

$ErrorActionPreference = "Stop"

# ---- ツールパス ----
$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk"
$Apksigner = "$AndroidSdk\build-tools\36.1.0\apksigner.bat"
$Adb = "$AndroidSdk\platform-tools\adb.exe"
$Keystore = "$env:USERPROFILE\BookReader.jks"
$KeystoreAlias = "BookReaderKey"
$KeystorePass = "v7xTcuHflt"   # ストアパス＝キーパス

# ---- 前提チェック ----
if (!(Test-Path $Apksigner)) { throw "apksigner が見つかりません: $Apksigner" }
if (!(Test-Path $Keystore))  { throw "キーストアが見つかりません: $Keystore" }

# ---- 出力先 ----
if (!(Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

# ---- Step 1: unsigned APK の入手 ----
if ($UnsignedApkPath -and (Test-Path $UnsignedApkPath)) {
    $UnsignedApk = $UnsignedApkPath
    Write-Host "[1/4] 既存の unsigned APK を使用: $UnsignedApk" -ForegroundColor Cyan
} elseif ($PwaUrl) {
    Write-Host "[1/4] PWABuilder 経由で APK を生成中: $PwaUrl" -ForegroundColor Cyan
    # PWABuilder API を呼び出して Android パッケージを生成
    $apiUrl = "https://pwabuilder.com/api/package/android"
    $body = @{ url = $PwaUrl } | ConvertTo-Json
    try {
        $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 120
        # response からダウンロード URL を取得
        if ($response -and $response.downloadUrl) {
            $zipUrl = $response.downloadUrl
            $zipPath = Join-Path $OutputDir "pwabuilder-package.zip"
            Write-Host "  パッケージ ZIP をダウンロード中: $zipUrl"
            Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
            # ZIP 内の unsigned APK を探す
            $tempDir = Join-Path $OutputDir "temp_package"
            if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
            Expand-Archive -Path $zipPath -DestinationPath $tempDir
            $unsignedFiles = Get-ChildItem -Path $tempDir -Filter "*unsigned*.apk" -Recurse
            if (!$unsignedFiles) {
                $unsignedFiles = Get-ChildItem -Path $tempDir -Filter "*.apk" -Recurse
            }
            if (!$unsignedFiles) { throw "ZIP 内に APK が見つかりませんでした" }
            $UnsignedApk = $unsignedFiles[0].FullName
            Write-Host "  unsigned APK: $UnsignedApk" -ForegroundColor Green
            Remove-Item -Recurse -Force $tempDir
        } else {
            throw "PWABuilder API からダウンロード URL が返されませんでした"
        }
    } catch {
        Write-Warning "PWABuilder API 呼び出しに失敗しました: $_"
        Write-Host "  手動で https://www.pwabuilder.com から unsigned APK をダウンロードし、-UnsignedApkPath を指定して再実行してください。" -ForegroundColor Yellow
        exit 1
    }
} else {
    throw "PwaUrl または UnsignedApkPath のいずれかを指定してください。"
}

$signedApk = Join-Path $OutputDir "BookReader-signed.apk"

# ---- Step 2: 署名 ----
Write-Host "[2/4] apksigner で署名中..." -ForegroundColor Cyan
& $Apksigner sign `
    --ks $Keystore `
    --ks-key-alias $KeystoreAlias `
    --ks-pass pass:$KeystorePass `
    --key-pass pass:$KeystorePass `
    --v1-signing-enabled true `
    --v2-signing-enabled true `
    --out $signedApk `
    $UnsignedApk

if ($LASTEXITCODE -ne 0) { throw "署名に失敗しました (exit code: $LASTEXITCODE)" }
Write-Host "  署名済み APK: $signedApk" -ForegroundColor Green

# ---- Step 3: 署名検証 ----
Write-Host "[3/4] 署名を検証中..." -ForegroundColor Cyan
$verifyResult = & $Apksigner verify --verbose $signedApk 2>&1 | Out-String
Write-Host $verifyResult
if ($verifyResult -match "Verified using v1 scheme.*true" -and $verifyResult -match "Verified using v2 scheme.*true") {
    Write-Host "  署名検証 OK (v1 + v2)" -ForegroundColor Green
} else {
    Write-Warning "署名検証に問題がある可能性があります。"
}

# ---- Step 4: インストール ----
if (!$NoInstall) {
    Write-Host "[4/4] adb で Quest 3 にインストール中..." -ForegroundColor Cyan
    if (!(Test-Path $Adb)) { throw "adb が見つかりません: $Adb" }
    # デバイスが接続されているか確認
    $devices = & $Adb devices 2>&1 | Select-String "device$"
    if (!$devices) {
        Write-Warning "接続されているデバイスがありません。adb devices で確認してください。"
        Write-Host "  署名済み APK は $signedApk にあります。" -ForegroundColor Yellow
    } else {
        # 既存のパッケージがあれば一旦アンインストール（必要に応じて）
        # & $Adb uninstall com.example.app 2>$null
        & $Adb install -r $signedApk
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  インストール完了！" -ForegroundColor Green
        } else {
            Write-Warning "インストールに失敗しました (exit code: $LASTEXITCODE)"
        }
    }
} else {
    Write-Host "[4/4] --NoInstall が指定されたためインストールをスキップしました" -ForegroundColor Cyan
    Write-Host "  署名済み APK: $signedApk" -ForegroundColor Green
}

Write-Host "`n完了: $signedApk" -ForegroundColor Cyan
