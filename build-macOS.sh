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
ICON_COMPOSER_SRC="./build/darwin/appicon.icon"
ICON_COMPOSER_NAME="appicon"
CONFIG_FILE="internal/app/config.go"
APP_VERSION_LDFLAG="dinkisstyle-markdown-browser/internal/app.AppVersion"
ICON_ASSET_DIR=""

cleanup_build_temp() {
    if [ -n "${ICON_ASSET_DIR}" ] && [ -d "${ICON_ASSET_DIR}" ]; then
        rm -rf "${ICON_ASSET_DIR}"
    fi
}
trap cleanup_build_temp EXIT

read_app_version() {
    local version
    version=$(sed -n \
        -e 's/^[[:space:]]*var[[:space:]]*AppVersion[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' \
        -e 's/^[[:space:]]*AppVersion[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' \
        "${CONFIG_FILE}" | head -n 1)
    if [ -z "${version}" ]; then
        echo "❌ Failed to read AppVersion from ${CONFIG_FILE}" >&2
        return 1
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
command -v npm   >/dev/null 2>&1 || { echo "❌ npm is not installed. Install Node.js and npm first."; exit 1; }

sync_wails_product_version
mkdir -p "${OUT_DIR}"

# Keep node_modules in sync with package-lock.json. Wails runs the frontend
# build but does not refresh an existing, stale dependency installation.
echo "📦 Refreshing frontend dependencies..."
(
    cd frontend
    if [ -f package-lock.json ]; then
        npm ci
    else
        npm install
    fi
)

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

# ── Modern macOS Icon Asset (Icon Composer → Assets.car) ─────
# macOS 26+ applies an automatic glass treatment to legacy ICNS files. Compile
# the Icon Composer document so the app can explicitly control those effects.
if [ -d "${ICON_COMPOSER_SRC}" ] && command -v xcrun >/dev/null 2>&1; then
    ACTOOL_PATH="$(xcrun --find actool 2>/dev/null || true)"
    if [ -n "${ACTOOL_PATH}" ]; then
        ICON_ASSET_DIR="$(mktemp -d /tmp/DKSTAppIconAssets.XXXXXX)"
        echo "🎨 Compiling modern macOS icon assets..."
        if ! "${ACTOOL_PATH}" "${ICON_COMPOSER_SRC}" \
            --compile "${ICON_ASSET_DIR}" \
            --notices --warnings --errors \
            --output-partial-info-plist "${ICON_ASSET_DIR}/partial.plist" \
            --app-icon "${ICON_COMPOSER_NAME}" \
            --enable-on-demand-resources NO \
            --development-region en \
            --target-device mac \
            --minimum-deployment-target 26.0 \
            --platform macosx \
            > "${ICON_ASSET_DIR}/actool-results.plist"; then
            echo "⚠️  Warning: Failed to compile Icon Composer assets; using the legacy ICNS fallback." >&2
            rm -rf "${ICON_ASSET_DIR}"
            ICON_ASSET_DIR=""
        elif [ ! -s "${ICON_ASSET_DIR}/Assets.car" ]; then
            echo "⚠️  Warning: actool did not create Assets.car; using the legacy ICNS fallback." >&2
            rm -rf "${ICON_ASSET_DIR}"
            ICON_ASSET_DIR=""
        else
            echo "   ✅ Modern macOS icon assets created successfully."
        fi
    fi
fi

# ── Build Execution ─────────────────────────────────────────────
echo "🔨 Starting Build for ${ARCH}..."
wails build \
    -platform "darwin/${ARCH}" \
    -o "${APP_NAME}" \
    -ldflags "-X '${APP_VERSION_LDFLAG}=${VERSION}'" \
    -clean

# ── .app Bundle Processing & Signing ─────────────────────────
APP_BUNDLE="./build/bin/${APP_NAME}.app"
if [ -d "${APP_BUNDLE}" ]; then
    echo "📝 Processing application bundle metadata and signing..."

    # Wails regenerates iconfile.icns from appicon.png while packaging, which
    # reduces the quality of the smaller icon sizes. Restore the prepared ICNS
    # before signing so the final app bundle keeps the supplied icon unchanged.
    if [ ! -s "${ICNS_PATH}" ]; then
        echo "❌ App icon not found or empty: ${ICNS_PATH}" >&2
        exit 1
    fi
    echo "🖼  Restoring the prepared application icon..."
    cp "${ICNS_PATH}" "${APP_BUNDLE}/Contents/Resources/iconfile.icns"

    if [ -n "${ICON_ASSET_DIR}" ] && [ -s "${ICON_ASSET_DIR}/Assets.car" ]; then
        echo "🎨 Installing modern macOS icon assets..."
        cp "${ICON_ASSET_DIR}/Assets.car" "${APP_BUNDLE}/Contents/Resources/Assets.car"
        if ! /usr/libexec/PlistBuddy -c "Set :CFBundleIconName ${ICON_COMPOSER_NAME}" "${APP_BUNDLE}/Contents/Info.plist" 2>/dev/null; then
            /usr/libexec/PlistBuddy -c "Add :CFBundleIconName string ${ICON_COMPOSER_NAME}" "${APP_BUNDLE}/Contents/Info.plist"
        fi
    fi

    if [ -f "${DOC_ICON_SRC}" ]; then
        cp "${DOC_ICON_SRC}" "${APP_BUNDLE}/Contents/Resources/markdown-doc.icns"
    fi

    # Remove hidden metadata attributes that can break code signing. Run this
    # after copying resources so their extended attributes are removed as well.
    xattr -cr "${APP_BUNDLE}"
    
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
