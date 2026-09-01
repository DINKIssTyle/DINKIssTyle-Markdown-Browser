@echo off
REM ============================================================
REM build-Windows.bat — DINKIssTyle Markdown Browser Windows Build
REM Created by DINKIssTyle on 2026.
REM Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
REM ============================================================
setlocal enabledelayedexpansion

set APP_NAME=DKST Markdown Browser
set ARCH=%1
if "%ARCH%"=="" set ARCH=amd64
set OUT_DIR=dist\windows
set CONFIG_FILE=internal\app\config.go
set APP_VERSION_LDFLAG=dinkisstyle-markdown-browser/internal/app.AppVersion

set VERSION=
for /f "tokens=1,* delims==" %%A in ('findstr /r /c:"AppVersion[ ]*=" "%CONFIG_FILE%"') do (
    set "VERSION=%%B"
)
:trim_version
if "!VERSION:~0,1!"==" " (
    set "VERSION=!VERSION:~1!"
    goto trim_version
)
set "VERSION=%VERSION:"=%"
if "!VERSION!"=="" (
    echo [ERROR] Failed to read AppVersion from %CONFIG_FILE%
    exit /b 1
)

echo ============================================================
echo  DKST Markdown Browser — Windows Build
echo  Architecture : %ARCH%
echo  Version      : !VERSION!
echo ============================================================

REM ── Dependency Check ─────────────────────────────────────────────
where wails3 >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ^[ERROR^] wails3 is not installed.
    echo         go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.3
    exit /b 1
)
where go >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ^[ERROR^] Go is not installed.
    exit /b 1
)

powershell -NoProfile -Command "$content = Get-Content 'build/config.yml' -Raw; $content = $content -replace '(?m)^  version: \"[^\"]+\"', '  version: \"!VERSION!\"'; $content = $content -replace '(?m)^  copyright: \"[^\"]+\"', '  copyright: \"© 2026 DINKI''ssTyle\"'; Set-Content 'build/config.yml' $content"
powershell -NoProfile -Command "$content = Get-Content 'build/windows/info.json' -Raw; $content = $content -replace '\"file_version\":\s*\"[^\"]+\"', '\"file_version\": \"!VERSION!\"'; $content = $content -replace '\"ProductVersion\":\s*\"[^\"]+\"', '\"ProductVersion\": \"!VERSION!\"'; $content = $content -replace '\"LegalCopyright\":\s*\"[^\"]+\"', '\"LegalCopyright\": \"© 2026 DINKI''ssTyle\"'; Set-Content 'build/windows/info.json' $content"
powershell -NoProfile -Command "$content = Get-Content 'build/windows/wails.exe.manifest' -Raw; $content = $content -replace 'version=\"[^\"]+\"', 'version=\"!VERSION!\"'; Set-Content 'build/windows/wails.exe.manifest' $content"
powershell -NoProfile -Command "$content = Get-Content 'build/windows/nsis/wails_tools.nsh' -Raw; $content = $content -replace '!define INFO_PRODUCTVERSION \"[^\"]+\"', '!define INFO_PRODUCTVERSION \"!VERSION!\"'; $content = $content -replace '!define INFO_COPYRIGHT \"[^\"]+\"', '!define INFO_COPYRIGHT \"© 2026 DINKI''ssTyle\"'; Set-Content 'build/windows/nsis/wails_tools.nsh' $content"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to sync Wails 3 build metadata
    exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

REM ── Build Execution ──────────────────────────────────────────────
if /I "%ARCH%"=="amd64" (
    echo [*] Starting Windows amd64 build...
    wails3 task build GOOS=windows ARCH=amd64 VERSION="!VERSION!"
) else if /I "%ARCH%"=="arm64" (
    echo [*] Starting Windows arm64 build...
    wails3 task build GOOS=windows ARCH=arm64 VERSION="!VERSION!"
) else if /I "%ARCH%"=="386" (
    echo [*] Starting Windows 386 build...
    wails3 task build GOOS=windows ARCH=386 VERSION="!VERSION!"
) else (
    echo [ERROR] Unknown architecture: %ARCH%  (amd64 ^| arm64 ^| 386^)
    exit /b 1
)
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Windows build failed
    exit /b 1
)

REM Refuse to package a stale frontend bundle that omits desktop settings.
findstr /c:"Remember window size and position" "frontend\dist\index.html" >nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Window state setting is missing from frontend\dist\index.html
    exit /b 1
)

REM ── Result Copy ────────────────────────────────────────────
set EXE_PATH=bin\%APP_NAME%.exe
if exist "%EXE_PATH%" (
    copy /Y "%EXE_PATH%" "%OUT_DIR%\%APP_NAME%-!VERSION!-windows-%ARCH%.exe"
    echo.
    echo [OK] Build completed!
    echo      Output Path: "%OUT_DIR%\%APP_NAME%-!VERSION!-windows-%ARCH%.exe"
    echo.
    echo [TIP] To create an NSIS installer, use the scripts in build\windows\installer\.
) else (
    echo [ERROR] Executable not found: "%EXE_PATH%"
    exit /b 1
)

endlocal
