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

for /f "tokens=3 delims== " %%A in ('findstr /r /c:"AppVersion = " config.go') do set VERSION=%%~A
set VERSION=%VERSION:"=%
if "%VERSION%"=="" (
    echo [ERROR] Failed to read AppVersion from config.go
    exit /b 1
)

echo ============================================================
echo  DKST Markdown Browser — Windows Build
echo  Architecture : %ARCH%
echo  Version      : %VERSION%
echo ============================================================

REM ── Dependency Check ─────────────────────────────────────────────
where wails >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ^[ERROR^] wails is not installed.
    echo         go install github.com/wailsapp/wails/v2/cmd/wails@latest
    exit /b 1
)
where go >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ^[ERROR^] Go is not installed.
    exit /b 1
)

powershell -NoProfile -Command "$content = Get-Content 'wails.json' -Raw; $content = $content -replace '\"productVersion\":\s*\"[^\"]+\"', '\"productVersion\": \"%VERSION%\"'; Set-Content 'wails.json' $content"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to sync wails.json productVersion
    exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

REM ── Build Execution ──────────────────────────────────────────────
if /I "%ARCH%"=="amd64" (
    echo [*] Starting Windows amd64 build...
    wails build -platform windows/amd64 -o "%APP_NAME%.exe" -ldflags "-X main.AppVersion=%VERSION%" -clean
) else if /I "%ARCH%"=="arm64" (
    echo [*] Starting Windows arm64 build...
    wails build -platform windows/arm64 -o "%APP_NAME%.exe" -ldflags "-X main.AppVersion=%VERSION%" -clean
) else if /I "%ARCH%"=="386" (
    echo [*] Starting Windows 386 build...
    wails build -platform windows/386 -o "%APP_NAME%.exe" -ldflags "-X main.AppVersion=%VERSION%" -clean
) else (
    echo [ERROR] Unknown architecture: %ARCH%  (amd64 ^| arm64 ^| 386^)
    exit /b 1
)

REM ── Result Copy ────────────────────────────────────────────
set EXE_PATH=build\bin\%APP_NAME%.exe
if exist "%EXE_PATH%" (
    copy /Y "%EXE_PATH%" "%OUT_DIR%\%APP_NAME%-%VERSION%-windows-%ARCH%.exe"
    echo.
    echo [OK] Build completed!
    echo      Output Path: "%OUT_DIR%\%APP_NAME%-%VERSION%-windows-%ARCH%.exe"
    echo.
    echo [TIP] To create an NSIS installer, use the scripts in build\windows\installer\.
) else (
    echo [WARN] Executable not found: "%EXE_PATH%"
)

endlocal
