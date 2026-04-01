#!/usr/bin/env bash
# ============================================================
# build_linux.sh — DINKIssTyle Markdown Browser Linux Build
# Created by DINKIssTyle on 2026.
# Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
# ============================================================
set -euo pipefail

APP_NAME="DKST Markdown Browser"
VERSION="1.0.0"
ARCH="${1:-amd64}"   # amd64 | arm64 | arm (기본값 amd64)
OUT_DIR="./dist/linux"

echo "============================================================"
echo " DKST Markdown Browser — Linux Build"
echo " Architecture : ${ARCH}"
echo " Version      : ${VERSION}"
echo "============================================================"

# ── 의존성 확인 ──────────────────────────────────────────────
command -v wails >/dev/null 2>&1 || { echo "❌ wails 가 설치되어 있지 않습니다. 'go install github.com/wailsapp/wails/v2/cmd/wails@latest' 로 설치하세요."; exit 1; }
command -v go    >/dev/null 2>&1 || { echo "❌ Go 가 설치되어 있지 않습니다."; exit 1; }

# Linux에서 WebKit2GTK 필요 여부 안내
if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null && \
   ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then
    echo "⚠️  WebKit2GTK 가 설치되어 있지 않습니다."
    echo "   Ubuntu/Debian : sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev"
    echo "   Fedora        : sudo dnf install webkit2gtk4.1-devel gtk3-devel"
    echo "   Arch Linux    : sudo pacman -S webkit2gtk-4.1"
    echo ""
    echo "   계속 진행하시겠습니까? (y/N)"
    read -r REPLY
    [[ "${REPLY}" =~ ^[Yy]$ ]] || exit 1
fi

mkdir -p "${OUT_DIR}"

# ── 빌드 실행 ─────────────────────────────────────────────
case "${ARCH}" in
    amd64)
        echo "🔨 Linux amd64 빌드 시작..."
        wails build \
            -platform "linux/amd64" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    arm64)
        echo "🔨 Linux arm64 빌드 시작..."
        wails build \
            -platform "linux/arm64" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    arm)
        echo "🔨 Linux arm (32-bit) 빌드 시작..."
        wails build \
            -platform "linux/arm" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    *)
        echo "❌ 알 수 없는 아키텍처: ${ARCH}  (amd64 | arm64 | arm)"
        exit 1
        ;;
esac

# ── 결과물 복사 ─────────────────────────────────────────────
BIN_PATH="./build/bin/${APP_NAME}"
if [ -f "${BIN_PATH}" ]; then
    OUT_BIN="${OUT_DIR}/${APP_NAME}-${VERSION}-linux-${ARCH}"
    cp "${BIN_PATH}" "${OUT_BIN}"
    chmod +x "${OUT_BIN}"
    echo ""
    echo "✅ 빌드 완료!"
    echo "   출력 경로 : ${OUT_BIN}"
    echo ""
    echo "📦 .deb 패키지 생성 예시 (선택 사항):"
    echo "   fpm -s dir -t deb -n '${APP_NAME}' -v '${VERSION}' \\"
    echo "     --prefix /usr/local/bin '${OUT_BIN}=.'"
    echo ""
    echo "📦 AppImage 생성은 appimage-builder 또는 linuxdeploy를 사용하세요."
else
    echo "⚠️  실행 파일을 찾을 수 없습니다: ${BIN_PATH}"
fi
