#!/usr/bin/env bash
# ============================================================
# build-iOS.sh — DKST Markdown Browser iOS/iPadOS Build
# Created by DINKIssTyle on 2026.
# Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

APP_NAME="DKST Markdown Browser"
BUNDLE_ID="${IOS_BUNDLE_ID:-com.dinkisstyle.mdbrowser}"
MODE="${1:-simulator}" # simulator | device | ipa
MIN_IOS_VERSION="${MIN_IOS_VERSION:-15.0}"
OUT_DIR="./dist/ios"
CONFIG_FILE="internal/app/config.go"
IOS_INFO_PLIST="build/ios/Info.plist"

show_help() {
    cat <<'EOF'
Usage: ./build-iOS.sh [simulator|device|ipa]

  simulator  Build an ad-hoc signed Simulator .app (default)
  device     Build a signed physical-device .app
  ipa        Build a signed physical-device .ipa

Device/IPA environment variables:
  IOS_CODESIGN_IDENTITY     Apple Development/Distribution identity
  IOS_PROVISIONING_PROFILE Path to a .mobileprovision file (optional)
  IOS_ENTITLEMENTS_FILE     Entitlements plist (optional)
  IOS_BUNDLE_ID             Bundle identifier override
  MIN_IOS_VERSION           Minimum iOS version (default: 15.0)
EOF
}

if [ "${MODE}" = "-h" ] || [ "${MODE}" = "--help" ]; then
    show_help
    exit 0
fi

case "${MODE}" in
    simulator|device|ipa) ;;
    *)
        echo "❌ Unknown build mode: ${MODE}" >&2
        show_help >&2
        exit 2
        ;;
esac

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

sync_product_version() {
    APP_BUILD_VERSION="${VERSION}" perl -0pi -e \
        's/^  version: "[^"]+"/  version: "$ENV{APP_BUILD_VERSION}"/m' \
        build/config.yml
    APP_BUILD_VERSION="${VERSION}" APP_BUILD_BUNDLE_ID="${BUNDLE_ID}" perl -0pi -e '
        s{(<key>CFBundleVersion</key>\s*<string>)[^<]*(</string>)}{$1$ENV{APP_BUILD_VERSION}$2};
        s{(<key>CFBundleShortVersionString</key>\s*<string>)[^<]*(</string>)}{$1$ENV{APP_BUILD_VERSION}$2};
        s{(<key>CFBundleIdentifier</key>\s*<string>)[^<]*(</string>)}{$1$ENV{APP_BUILD_BUNDLE_ID}$2};
    ' "${IOS_INFO_PLIST}"
    plutil -lint "${IOS_INFO_PLIST}" >/dev/null
}

resolve_codesign_identity() {
    if [ -n "${IOS_CODESIGN_IDENTITY:-}" ]; then
        echo "${IOS_CODESIGN_IDENTITY}"
        return
    fi
    if [ -n "${CODESIGN_IDENTITY:-}" ] && [ "${CODESIGN_IDENTITY}" != "-" ]; then
        echo "${CODESIGN_IDENTITY}"
        return
    fi

    local identity
    identity=$(security find-identity -v -p codesigning 2>/dev/null \
        | sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | head -n 1)
    if [ -z "${identity}" ]; then
        identity=$(security find-identity -v -p codesigning 2>/dev/null \
            | sed -n 's/.*"\(Apple Distribution:[^"]*\)".*/\1/p' | head -n 1)
    fi
    echo "${identity}"
}

sync_frontend_dependencies() {
    echo "📦 Refreshing frontend dependencies..."
    (
        cd frontend
        if [ -f package-lock.json ]; then
            npm ci
        else
            npm install
        fi
    )
}

export PATH="${HOME}/go/bin:/usr/local/go/bin:/opt/homebrew/bin:${PATH}"

command -v wails3 >/dev/null 2>&1 || { echo "❌ wails3 is not installed." >&2; exit 1; }
command -v go >/dev/null 2>&1 || { echo "❌ Go is not installed." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is not installed." >&2; exit 1; }
command -v xcrun >/dev/null 2>&1 || { echo "❌ Xcode command-line tools are not installed." >&2; exit 1; }
command -v codesign >/dev/null 2>&1 || { echo "❌ codesign is not available." >&2; exit 1; }
if [ "${MODE}" = "ipa" ]; then
    command -v zip >/dev/null 2>&1 || { echo "❌ zip is required to create an IPA." >&2; exit 1; }
fi

VERSION="$(read_app_version)"
sync_product_version
sync_frontend_dependencies
mkdir -p "${OUT_DIR}"

echo "============================================================"
echo " DKST Markdown Browser — iOS/iPadOS Build"
echo " Mode         : ${MODE}"
echo " Bundle ID    : ${BUNDLE_ID}"
echo " Minimum iOS  : ${MIN_IOS_VERSION}"
echo " Version      : ${VERSION}"
echo "============================================================"

TASK_ARGS=(
    "BUNDLE_ID=${BUNDLE_ID}"
    "MIN_IOS_VERSION=${MIN_IOS_VERSION}"
    "ARCH=arm64"
)

if [ "${MODE}" = "simulator" ]; then
    TASK_ARGS+=("IOS_PLATFORM=simulator" "CODESIGN_IDENTITY=-")
    echo "🔨 Building Simulator application..."
    wails3 task ios:package "${TASK_ARGS[@]}"

    SOURCE_APP="./bin/${APP_NAME}.app"
    OUTPUT_APP="${OUT_DIR}/${APP_NAME}-${VERSION}-ios-simulator.app"
    rm -rf "${OUTPUT_APP}"
    cp -R "${SOURCE_APP}" "${OUTPUT_APP}"
    echo "✅ Build completed: ${OUTPUT_APP}"
    exit 0
fi

SIGN_IDENTITY="$(resolve_codesign_identity)"
if [ -z "${SIGN_IDENTITY}" ]; then
    echo "❌ A real Apple signing identity is required for ${MODE} builds." >&2
    echo "   Set IOS_CODESIGN_IDENTITY or install an Apple Development certificate." >&2
    exit 1
fi

PROVISIONING_PROFILE="${IOS_PROVISIONING_PROFILE:-${PROVISIONING_PROFILE:-}}"
ENTITLEMENTS_FILE="${IOS_ENTITLEMENTS_FILE:-build/ios/entitlements.plist}"
if [ -n "${PROVISIONING_PROFILE}" ] && [ ! -f "${PROVISIONING_PROFILE}" ]; then
    echo "❌ Provisioning profile not found: ${PROVISIONING_PROFILE}" >&2
    exit 1
fi

TASK_ARGS+=(
    "IOS_PLATFORM=device"
    "CODESIGN_IDENTITY=${SIGN_IDENTITY}"
    "ENTITLEMENTS_FILE=${ENTITLEMENTS_FILE}"
)
if [ -n "${PROVISIONING_PROFILE}" ]; then
    TASK_ARGS+=("PROVISIONING_PROFILE=${PROVISIONING_PROFILE}")
else
    echo "⚠️  No provisioning profile supplied; the bundle may require Xcode-managed signing before installation."
fi

if [ "${MODE}" = "ipa" ]; then
    echo "🔨 Building signed IPA..."
    wails3 task ios:package:ipa "${TASK_ARGS[@]}"
    SOURCE_IPA="./bin/${APP_NAME}.ipa"
    OUTPUT_IPA="${OUT_DIR}/${APP_NAME}-${VERSION}-ios.ipa"
    cp -f "${SOURCE_IPA}" "${OUTPUT_IPA}"
    echo "✅ Build completed: ${OUTPUT_IPA}"
else
    echo "🔨 Building signed device application..."
    wails3 task ios:package "${TASK_ARGS[@]}"
    SOURCE_APP="./bin/${APP_NAME}.app"
    OUTPUT_APP="${OUT_DIR}/${APP_NAME}-${VERSION}-ios-device.app"
    rm -rf "${OUTPUT_APP}"
    cp -R "${SOURCE_APP}" "${OUTPUT_APP}"
    echo "✅ Build completed: ${OUTPUT_APP}"
fi
