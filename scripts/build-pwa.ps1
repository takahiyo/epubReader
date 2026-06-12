<#
.SYNOPSIS
    PWA ビルド → APK署名 → Quest 3 サイドロード（Gradle + apksigner）
.DESCRIPTION
    1. Android プロジェクトを Gradle でビルド（unsigned APK 生成）
    2. apksigner で v1+v2+v3 署名
    3. 署名検証
    4. adb で Quest 3 にインストール
.PARAMETER SkipBuild
    Gradle ビルドをスキップ（既存の unsigned APK を使う場合）
.PARAMETER UnsignedApkPath
    unsigned APK のパス（-SkipBuild と併用）
.PARAMETER NoInstall
    署名後、インストールをスキップ
.PARAMETER OutputDir
    出力先ディレクトリ（デフォルト: android-project/）
.EXAMPLE
    .\build-pwa.ps1                     # フルビルド→署名→インストール
    .\build-pwa.ps1 -SkipBuild          # 署名のみ
    .\build-pwa.ps1 -NoInstall          # 署名まで（インストールなし）
#>

param(
    [switch]$SkipBuild,
    [string]$UnsignedApkPath = "",
    [switch]$NoInstall,
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

# ---- パス設定 ----
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AndroidProject = Join-Path $RepoRoot "android-project"
$JdkHome = "C:\Program Files\Eclipse Adoptium\jdk-21.0.7.6-hotspot"
$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk"
$Apksigner = "$AndroidSdk\build-tools\36.1.0\apksigner.bat"
$Adb = "$AndroidSdk\platform-tools\adb.exe"
$Keystore = "$env:USERPROFILE\BookReader.jks"
$KeystoreAlias = "BookReaderKey"
$KeystorePass = "v7xTcuHflt"

if (!$OutputDir) { $OutputDir = $AndroidProject }

# ---- 前提チェック ----
if (!(Test-Path $JdkHome))    { throw "JDK が見つかりません: $JdkHome" }
if (!(Test-Path $AndroidSdk)) { throw "Android SDK が見つかりません: $AndroidSdk" }
if (!(Test-Path $Apksigner))  { throw "apksigner が見つかりません: $Apksigner" }
if (!(Test-Path $Keystore))   { throw "キーストアが見つかりません: $Keystore" }

# ---- 環境変数設定 ----
$env:JAVA_HOME = $JdkHome
$env:ANDROID_HOME = $AndroidSdk

# ---- Step 1: Gradle ビルド ----
if ($SkipBuild) {
    if ($UnsignedApkPath -and (Test-Path $UnsignedApkPath)) {
        $UnsignedApk = $UnsignedApkPath
        Write-Host "[1/3] 既存の unsigned APK を使用: $UnsignedApk" -ForegroundColor Cyan
    } else {
        throw "-SkipBuild を指定する場合は -UnsignedApkPath も指定してください"
    }
} else {
    Write-Host "[1/3] Gradle で APK をビルド中..." -ForegroundColor Cyan
    $gradlew = Join-Path $AndroidProject "gradlew.bat"
    if (!(Test-Path $gradlew)) { throw "gradlew.bat が見つかりません: $gradlew" }

    $buildLog = Join-Path $OutputDir "gradle-build.log"
    Push-Location $AndroidProject
    try {
        & $gradlew.bat assembleRelease --no-daemon 2>&1 | Tee-Object -FilePath $buildLog
        if ($LASTEXITCODE -ne 0) { throw "Gradle ビルドに失敗しました (exit code: $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }

    $UnsignedApk = Join-Path $AndroidProject "app\build\outputs\apk\release\app-release-unsigned.apk"
    if (!(Test-Path $UnsignedApk)) { throw "unsigned APK が生成されませんでした" }
    Write-Host "  unsigned APK: $UnsignedApk" -ForegroundColor Green
}

# ---- Step 2: 署名 ----
$SignedApk = Join-Path $OutputDir "BookReader-signed.apk"
Write-Host "[2/3] apksigner で署名中..." -ForegroundColor Cyan
& $Apksigner sign `
    --ks $Keystore `
    --ks-key-alias $KeystoreAlias `
    --ks-pass pass:$KeystorePass `
    --key-pass pass:$KeystorePass `
    --v1-signing-enabled true `
    --v2-signing-enabled true `
    --out $SignedApk `
    $UnsignedApk

if ($LASTEXITCODE -ne 0) { throw "署名に失敗しました (exit code: $LASTEXITCODE)" }
Write-Host "  署名済み APK: $SignedApk" -ForegroundColor Green

# ---- Step 3: 署名検証 ----
Write-Host "[3/3] 署名を検証中..." -ForegroundColor Cyan
$verifyResult = & $Apksigner verify --verbose $SignedApk 2>&1 | Out-String
Write-Host $verifyResult
if ($verifyResult -match "Verified using v1 scheme.*true" -and $verifyResult -match "Verified using v2 scheme.*true") {
    Write-Host "  署名検証 OK (v1 + v2)" -ForegroundColor Green
} else {
    Write-Warning "署名検証で v1/v2 が確認できませんでした"
}

# ---- Step 4: インストール ----
if (!$NoInstall) {
    Write-Host "[4/4] adb で Quest 3 にインストール中..." -ForegroundColor Cyan
    if (!(Test-Path $Adb)) { Write-Warning "adb が見つかりません: $Adb"; return }
    $devices = & $Adb devices 2>&1 | Select-String "device$"
    if (!$devices) {
        Write-Warning "接続されているデバイスがありません。adb devices で確認してください。"
        Write-Host "  署名済み APK は $SignedApk にあります。" -ForegroundColor Yellow
    } else {
        & $Adb install -r $SignedApk
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  インストール完了！" -ForegroundColor Green
        } else {
            Write-Warning "インストールに失敗しました (exit code: $LASTEXITCODE)"
        }
    }
} else {
    Write-Host "  署名済み APK: $SignedApk" -ForegroundColor Green
}

Write-Host "`n完了: $SignedApk" -ForegroundColor Cyan
