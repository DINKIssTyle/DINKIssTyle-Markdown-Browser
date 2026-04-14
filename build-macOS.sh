#!/usr/bin/env bash
# ============================================================
# build-macOS.sh — DKST Markdown Browser macOS Build
# Created by DINKIssTyle on 2026.
# Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
# ============================================================
set -euo pipefail

APP_NAME="DKST Markdown Browser"
BUNDLE_ID="com.dinkisstyle.mdbrowser"
ARCH="${1:-universal}"   # arm64 | amd64 | universal (default)
OUT_DIR="./dist/macos"
ENTITLEMENTS="build/darwin/entitlements.plist"
DOC_ICON_SRC="./build/darwin/markdown-doc.icns"

read_app_version() {
    local version
    version=$(sed -n 's/^[[:space:]]*AppVersion = "\(.*\)"/\1/p' config.go | head -n 1)
    if [ -z "${version}" ]; then
        echo "❌ Failed to read AppVersion from config.go"
        exit 1
    fi
    echo "${version}"
}

sync_wails_product_version() {
    perl -0pi -e 's/"productVersion":\s*"[^"]+"/"productVersion": "'"${VERSION}"'"/' wails.json
}

VERSION="$(read_app_version)"

echo "============================================================"
echo " DKST Markdown Browser — macOS Build"
echo " Architecture : ${ARCH}"
echo " Bundle ID    : ${BUNDLE_ID}"
echo " Version      : ${VERSION}"
echo "============================================================"

# ── Dependency Check & PATH Setup ──────────────────────────
export PATH="$HOME/go/bin:/usr/local/go/bin:/opt/homebrew/bin:$PATH"

command -v wails >/dev/null 2>&1 || { echo "❌ wails is not installed. Install it with 'go install github.com/wailsapp/wails/v2/cmd/wails@latest'."; exit 1; }
command -v go    >/dev/null 2>&1 || { echo "❌ Go is not installed."; exit 1; }

sync_wails_product_version
mkdir -p "${OUT_DIR}"

# ── Signing Identity Resolution ─────────────────────────────
resolve_signing_identity() {
    if [ -n "${MACOS_SIGN_IDENTITY:-}" ]; then
        echo "$MACOS_SIGN_IDENTITY"
        return 0
    fi

    local detected_identity
    detected_identity=$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -n 1)
    if [ -n "$detected_identity" ]; then
        echo "$detected_identity"
        return 0
    fi

    detected_identity=$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | head -n 1)
    if [ -n "$detected_identity" ]; then
        echo "$detected_identity"
        return 0
    fi

    echo "-"
}

SIGN_IDENTITY="$(resolve_signing_identity)"
if [ "$SIGN_IDENTITY" = "-" ]; then
    echo "⚠️  Warning: No fixed macOS signing identity found. Falling back to ad-hoc signing;"
else
    echo "✅ Using signing identity: $SIGN_IDENTITY"
fi

# ── Icon Conversion (appicon.png → iconfile.icns) ─────────────
ICNS_PATH="./build/darwin/iconfile.icns"
ICON_SRC="./build/appicon.png"
if [ ! -s "${ICNS_PATH}" ] && [ -f "${ICON_SRC}" ]; then
    echo "🖼  Converting appicon.png to iconfile.icns..."
    ICONSET_DIR="/tmp/AppIcon.iconset"
    rm -rf "${ICONSET_DIR}"
    mkdir -p "${ICONSET_DIR}"
    for SIZE in 16 32 64 128 256 512; do
        sips -z ${SIZE} ${SIZE} "${ICON_SRC}" --out "${ICONSET_DIR}/icon_${SIZE}x${SIZE}.png"    >/dev/null 2>&1
        sips -z $((SIZE*2)) $((SIZE*2)) "${ICON_SRC}" --out "${ICONSET_DIR}/icon_${SIZE}x${SIZE}@2x.png" >/dev/null 2>&1
    done
    iconutil -c icns "${ICONSET_DIR}" -o "${ICNS_PATH}"
    rm -rf "${ICONSET_DIR}"
    echo "   ✅ iconfile.icns created successfully."
fi

# ── Build Execution ─────────────────────────────────────────────
echo "🔨 Starting Build for ${ARCH}..."
wails build \
    -platform "darwin/${ARCH}" \
    -o "${APP_NAME}" \
    -ldflags "-X 'main.AppVersion=${VERSION}'" \
    -clean

# ── .app Bundle Processing & Signing ─────────────────────────
APP_BUNDLE="./build/bin/${APP_NAME}.app"
if [ -d "${APP_BUNDLE}" ]; then
    echo "📝 Processing application bundle metadata and signing..."
    
    # Remove hidden metadata attributes that can break code signing
    xattr -cr "${APP_BUNDLE}"

    if [ -f "${DOC_ICON_SRC}" ]; then
        cp "${DOC_ICON_SRC}" "${APP_BUNDLE}/Contents/Resources/markdown-doc.icns"
    fi
    
    EXE_PATH="${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"
    
    # Re-sign binaries to fix "Code Signature Invalid" crash and Hardened Runtime
    echo "🔐 Signing binaries..."
    # Sign main executable
    codesign --force --sign "$SIGN_IDENTITY" --timestamp=none --identifier "$BUNDLE_ID" --options runtime --entitlements "$ENTITLEMENTS" "$EXE_PATH"
    # Deep sign the app bundle
    codesign --force --sign "$SIGN_IDENTITY" --timestamp=none --identifier "$BUNDLE_ID" --options runtime --entitlements "$ENTITLEMENTS" --deep "$APP_BUNDLE"

    # Copy to dist folder
    cp -r "${APP_BUNDLE}" "${OUT_DIR}/"
    
    echo ""
    echo "✅ Build & Signing completed!"
    echo "   Output Path : ${OUT_DIR}/${APP_NAME}.app"
    echo ""
    echo "📦 To create a DMG:"
    echo "   hdiutil create -volname '${APP_NAME}' -srcfolder '${OUT_DIR}/${APP_NAME}.app' \\"
    echo "     -ov -format UDZO '${OUT_DIR}/${APP_NAME}-${VERSION}-macos.dmg'"
else
    echo "⚠️  .app bundle not found at: ${APP_BUNDLE}"
    exit 1
fi
