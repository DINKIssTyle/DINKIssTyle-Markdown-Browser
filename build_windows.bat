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

REM ── 의존성 확인 ─────────────────────────────────────────────
where wails >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ^[ERROR^] wails 가 설치되어 있지 않습니다.
    echo         go install github.com/wailsapp/wails/v2/cmd/wails@latest
    exit /b 1
)
where go >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ^[ERROR^] Go 가 설치되어 있지 않습니다.
    exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

REM ── 빌드 실행 ──────────────────────────────────────────────
if /I "%ARCH%"=="amd64" (
    echo [*] Windows amd64 빌드 시작...
    wails build -platform windows/amd64 -o "%APP_NAME%.exe" -ldflags "-X main.version=%VERSION%" -clean
) else if /I "%ARCH%"=="arm64" (
    echo [*] Windows arm64 빌드 시작...
    wails build -platform windows/arm64 -o "%APP_NAME%.exe" -ldflags "-X main.version=%VERSION%" -clean
) else if /I "%ARCH%"=="386" (
    echo [*] Windows 386 빌드 시작...
    wails build -platform windows/386 -o "%APP_NAME%.exe" -ldflags "-X main.version=%VERSION%" -clean
) else (
    echo [ERROR] 알 수 없는 아키텍처: %ARCH%  (amd64 ^| arm64 ^| 386^)
    exit /b 1
)

REM ── 결과물 복사 ────────────────────────────────────────────
set EXE_PATH=build\bin\%APP_NAME%.exe
if exist "%EXE_PATH%" (
    copy /Y "%EXE_PATH%" "%OUT_DIR%\%APP_NAME%-%VERSION%-windows-%ARCH%.exe"
    echo.
    echo [OK] 빌드 완료!
    echo      출력 경로: "%OUT_DIR%\%APP_NAME%-%VERSION%-windows-%ARCH%.exe"
    echo.
    echo [TIP] NSIS 인스톨러가 필요하면 build\windows\installer\ 안의 스크립트를 사용하세요.
) else (
    echo [WARN] 실행 파일을 찾을 수 없습니다: "%EXE_PATH%"
)

endlocal
