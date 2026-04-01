#!/usr/bin/env bash
# ============================================================
# build_linux.sh — DINKIssTyle Markdown Browser Linux Build
# Created by DINKIssTyle on 2026.
# Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
# ============================================================
set -euo pipefail

APP_NAME="DKST Markdown Browser"
VERSION="1.0.0"
ARCH="${1:-amd64}"   # amd64 | arm64 | arm (default amd64)
OUT_DIR="./dist/linux"

echo "============================================================"
echo " DKST Markdown Browser — Linux Build"
echo " Architecture : ${ARCH}"
echo " Version      : ${VERSION}"
echo "============================================================"

# ── Dependency Check ──────────────────────────────────────────────
command -v wails >/dev/null 2>&1 || { echo "❌ wails is not installed. Install it with 'go install github.com/wailsapp/wails/v2/cmd/wails@latest'."; exit 1; }
command -v go    >/dev/null 2>&1 || { echo "❌ Go is not installed."; exit 1; }

# WebKit2GTK check for Linux
if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null && \
   ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then
    echo "⚠️  WebKit2GTK is not installed."
    echo "   Ubuntu/Debian : sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev"
    echo "   Fedora        : sudo dnf install webkit2gtk4.1-devel gtk3-devel"
    echo "   Arch Linux    : sudo pacman -S webkit2gtk-4.1"
    echo ""
    echo "   Do you want to continue? (y/N)"
    read -r REPLY
    [[ "${REPLY}" =~ ^[Yy]$ ]] || exit 1
fi

mkdir -p "${OUT_DIR}"

# ── Build Execution ─────────────────────────────────────────────
case "${ARCH}" in
    amd64)
        echo "🔨 Starting Linux amd64 build..."
        wails build \
            -platform "linux/amd64" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    arm64)
        echo "🔨 Starting Linux arm64 build..."
        wails build \
            -platform "linux/arm64" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    arm)
        echo "🔨 Starting Linux arm (32-bit) build..."
        wails build \
            -platform "linux/arm" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    *)
        echo "❌ Unknown architecture: ${ARCH}  (amd64 | arm64 | arm)"
        exit 1
        ;;
esac

# ── Result Copy ─────────────────────────────────────────────
BIN_PATH="./build/bin/${APP_NAME}"
if [ -f "${BIN_PATH}" ]; then
    OUT_BIN="${OUT_DIR}/${APP_NAME}-${VERSION}-linux-${ARCH}"
    cp "${BIN_PATH}" "${OUT_BIN}"
    chmod +x "${OUT_BIN}"
    echo ""
    echo "✅ Build completed!"
    echo "   Output Path : ${OUT_BIN}"
    echo ""
    echo "📦 Example to create a .deb package (optional):"
    echo "   fpm -s dir -t deb -n '${APP_NAME}' -v '${VERSION}' \\"
    echo "     --prefix /usr/local/bin '${OUT_BIN}=.'"
    echo ""
    echo "📦 For AppImage creation, use appimage-builder or linuxdeploy."
else
    echo "⚠️  Executable not found: ${BIN_PATH}"
fi
