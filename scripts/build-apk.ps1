# 一键打包 APK
#
# 用法：在项目根目录运行
#   powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1
#
# 它做的事：
#   1. 临时移走 src/app/api（静态导出不支持 Route Handler）
#   2. BUILD_STATIC=1 next build → 生成 out/
#   3. 恢复 api 目录
#   4. cap sync 把 out/ 拷进 android 工程
#   5. gradlew assembleDebug 出 APK
#
# 注意：dev server 必须停掉，否则 .next/trace 被占用会报 EPERM。

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# ---- 环境 ----
$env:JAVA_HOME = 'D:\android-build\jdk17'
$env:ANDROID_HOME = 'D:\android-build\android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
$env:NEXT_TELEMETRY_DISABLED = '1'

if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
  throw "找不到 JDK 17：$env:JAVA_HOME"
}
if (-not (Test-Path "$env:ANDROID_HOME\platforms\android-34")) {
  throw "找不到 Android SDK platform 34：$env:ANDROID_HOME"
}

# ---- 停掉 dev server（.next 被占用会构建失败）----
$conn = Get-NetTCPConnection -State Listen -LocalPort 3312 -ErrorAction SilentlyContinue
if ($conn) {
  Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
  Write-Host '已停止 dev server' -ForegroundColor Yellow
  Start-Sleep -Seconds 2
}

# ---- 静态构建 ----
$apiDir = 'src\app\api'
$apiBak = 'src\app\_api_backup'
$moved = $false
try {
  if (Test-Path $apiDir) {
    Move-Item $apiDir $apiBak -Force
    $moved = $true
    Write-Host '临时移走 src/app/api' -ForegroundColor Yellow
  }

  Remove-Item '.next' -Recurse -Force -ErrorAction SilentlyContinue
  $env:BUILD_STATIC = '1'
  Write-Host '构建静态站点…' -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'next build 失败' }
} finally {
  if ($moved -and (Test-Path $apiBak)) {
    Move-Item $apiBak $apiDir -Force
    Write-Host '已恢复 src/app/api' -ForegroundColor Yellow
  }
}

if (-not (Test-Path 'out\index.html')) { throw '没有生成 out/index.html' }

# ---- 同步到 Android 工程 ----
Write-Host 'cap sync…' -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'cap sync 失败' }

# ---- 编译 ----
Write-Host 'gradle assembleDebug…' -ForegroundColor Cyan
Push-Location 'android'
try {
  cmd /c ".\gradlew.bat assembleDebug --no-daemon --console=plain"
  if ($LASTEXITCODE -ne 0) { throw 'gradle 构建失败' }
} finally {
  Pop-Location
}

# ---- 收尾 ----
$apk = Get-ChildItem 'android\app\build\outputs\apk' -Recurse -Filter '*.apk' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { throw '没找到 APK 产物' }

$dest = Join-Path ([Environment]::GetFolderPath('Desktop')) '衣柜.apk'
Copy-Item $apk.FullName $dest -Force

Write-Host ''
Write-Host '构建完成' -ForegroundColor Green
Write-Host "  APK : $($apk.FullName)"
Write-Host "  大小: $([math]::Round($apk.Length / 1MB, 2)) MB"
Write-Host "  桌面: $dest"
