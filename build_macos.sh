#!/usr/bin/env bash
# ============================================================
# build_macos.sh — DINKIssTyle Markdown Browser macOS Build
# Created by DINKIssTyle on 2026.
# Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
# ============================================================
set -euo pipefail

APP_NAME="DKST Markdown Browser"
BUNDLE_ID="com.dinkisstyle.mdbrowser"
VERSION="1.0.0"
ARCH="${1:-universal}"   # arm64 | amd64 | universal (default)
OUT_DIR="./dist/macos"

echo "============================================================"
echo " DKST Markdown Browser — macOS Build"
echo " Architecture : ${ARCH}"
echo " Bundle ID    : ${BUNDLE_ID}"
echo " Version      : ${VERSION}"
echo "============================================================"

# ── Dependency Check ──────────────────────────────────────────────
command -v wails >/dev/null 2>&1 || { echo "❌ wails is not installed. Install it with 'go install github.com/wailsapp/wails/v2/cmd/wails@latest'."; exit 1; }
command -v go    >/dev/null 2>&1 || { echo "❌ Go is not installed."; exit 1; }

mkdir -p "${OUT_DIR}"

# ── Icon Conversion (appicon.png → iconfile.icns) ─────────────
# Attempt to generate iconfile.icns from appicon.png if it doesn't exist or is invalid.
ICNS_PATH="./build/darwin/iconfile.icns"
ICON_SRC="./build/appicon.png"
if [ ! -s "${ICNS_PATH}" ] && [ -f "${ICON_SRC}" ]; then
    echo "🖼  Converting appicon.png to iconfile.icns..."
    ICONSET_DIR="/tmp/AppIcon.iconset"
    rm -rf "${ICONSET_DIR}"
    mkdir -p "${ICONSET_DIR}"
    # 다양한 해상도로 리사이즈
    for SIZE in 16 32 64 128 256 512; do
        sips -z ${SIZE} ${SIZE} "${ICON_SRC}" --out "${ICONSET_DIR}/icon_${SIZE}x${SIZE}.png"    >/dev/null 2>&1
        sips -z $((SIZE*2)) $((SIZE*2)) "${ICON_SRC}" --out "${ICONSET_DIR}/icon_${SIZE}x${SIZE}@2x.png" >/dev/null 2>&1
    done
    iconutil -c icns "${ICONSET_DIR}" -o "${ICNS_PATH}"
    rm -rf "${ICONSET_DIR}"
    echo "   ✅ iconfile.icns created successfully."
else
    echo "🖼  Using existing iconfile.icns"
fi

# ── Build Execution ─────────────────────────────────────────────
case "${ARCH}" in
    universal)
        echo "🔨 Starting Universal Binary build (arm64 + amd64)..."
        wails build \
            -platform "darwin/universal" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    arm64)
        echo "🔨 Starting Apple Silicon (arm64) build..."
        wails build \
            -platform "darwin/arm64" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    amd64)
        echo "🔨 Starting Intel (amd64) build..."
        wails build \
            -platform "darwin/amd64" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    *)
        echo "❌ Unknown architecture: ${ARCH}  (arm64 | amd64 | universal)"
        exit 1
        ;;
esac

# ── .app Bundle Copy ─────────────────────────────────────────
APP_BUNDLE="./build/bin/${APP_NAME}.app"
if [ -d "${APP_BUNDLE}" ]; then
    cp -r "${APP_BUNDLE}" "${OUT_DIR}/"
    echo ""
    echo "✅ Build completed!"
    echo "   Output Path : ${OUT_DIR}/${APP_NAME}.app"
    echo ""
    echo "📦 To create a DMG:"
    echo "   hdiutil create -volname '${APP_NAME}' -srcfolder '${OUT_DIR}/${APP_NAME}.app' \\"
    echo "     -ov -format UDZO '${OUT_DIR}/${APP_NAME}-${VERSION}-macos.dmg'"
else
    echo "⚠️  .app bundle not found: ${APP_BUNDLE}"
fi
