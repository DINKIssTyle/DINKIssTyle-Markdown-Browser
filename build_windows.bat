@echo off
REM ============================================================
REM build_windows.bat — DINKIssTyle Markdown Browser Windows Build
REM Created by DINKIssTyle on 2026.
REM Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
REM ============================================================
setlocal enabledelayedexpansion

set APP_NAME=DKST Markdown Browser
set VERSION=1.0.0
set ARCH=%1
if "%ARCH%"=="" set ARCH=amd64
set OUT_DIR=dist\windows

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

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

REM ── Build Execution ──────────────────────────────────────────────
if /I "%ARCH%"=="amd64" (
    echo [*] Starting Windows amd64 build...
    wails build -platform windows/amd64 -o "%APP_NAME%.exe" -ldflags "-X main.version=%VERSION%" -clean
) else if /I "%ARCH%"=="arm64" (
    echo [*] Starting Windows arm64 build...
    wails build -platform windows/arm64 -o "%APP_NAME%.exe" -ldflags "-X main.version=%VERSION%" -clean
) else if /I "%ARCH%"=="386" (
    echo [*] Starting Windows 386 build...
    wails build -platform windows/386 -o "%APP_NAME%.exe" -ldflags "-X main.version=%VERSION%" -clean
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
