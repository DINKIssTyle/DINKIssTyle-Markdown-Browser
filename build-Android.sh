#!/usr/bin/env bash
# ============================================================
# build-Android.sh — DKST Markdown Browser Android Build
# Created by DINKIssTyle on 2026.
# Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

APP_NAME="DKST Markdown Browser"
FORMAT="${1:-apk}"          # apk | aab
ARCH="${2:-universal}"      # universal | arm64 | amd64
OUT_DIR="./dist/android"
CONFIG_FILE="internal/app/config.go"
GRADLE_FILE="build/android/app/build.gradle"

show_help() {
    cat <<'EOF'
Usage: ./build-Android.sh [apk|aab] [universal|arm64|amd64]

  apk        Build a release APK (default)
  aab        Build a release Android App Bundle
  universal  Include arm64-v8a and x86_64 native libraries (default)
  arm64      Build for physical Android tablets/devices
  amd64      Build for an x86_64 emulator

Play Store/release signing environment variables:
  ANDROID_KEYSTORE_FILE
  ANDROID_KEYSTORE_PASSWORD
  ANDROID_KEY_ALIAS
  ANDROID_KEY_PASSWORD

Without these variables the release artifact uses the debug keystore and is
suitable for testing, but not for Google Play upload.
EOF
}

if [ "${FORMAT}" = "-h" ] || [ "${FORMAT}" = "--help" ]; then
    show_help
    exit 0
fi

case "${FORMAT}" in
    apk|aab) ;;
    *)
        echo "❌ Unknown Android output format: ${FORMAT}" >&2
        show_help >&2
        exit 2
        ;;
esac

case "${ARCH}" in
    universal|arm64|amd64) ;;
    *)
        echo "❌ Unknown Android architecture: ${ARCH}" >&2
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

calculate_version_code() {
    local core major minor patch
    core="${1%%-*}"
    IFS='.' read -r major minor patch <<<"${core}"
    major="${major:-0}"
    minor="${minor:-0}"
    patch="${patch:-0}"
    if ! [[ "${major}" =~ ^[0-9]+$ && "${minor}" =~ ^[0-9]+$ && "${patch}" =~ ^[0-9]+$ ]]; then
        echo "❌ AppVersion must use numeric major.minor.patch values: ${1}" >&2
        return 1
    fi
    echo $((10#${major} * 10000 + 10#${minor} * 100 + 10#${patch}))
}

sync_product_version() {
    APP_BUILD_VERSION="${VERSION}" perl -0pi -e \
        's/^  version: "[^"]+"/  version: "$ENV{APP_BUILD_VERSION}"/m' \
        build/config.yml
    APP_BUILD_VERSION="${VERSION}" APP_BUILD_CODE="${VERSION_CODE}" perl -0pi -e \
        's/versionName\s+"[^"]+"/versionName "$ENV{APP_BUILD_VERSION}"/; s/versionCode\s+\d+/versionCode $ENV{APP_BUILD_CODE}/' \
        "${GRADLE_FILE}"
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

configure_android_sdk() {
    if [ -z "${ANDROID_HOME:-}" ]; then
        if [ -n "${ANDROID_SDK_ROOT:-}" ]; then
            ANDROID_HOME="${ANDROID_SDK_ROOT}"
        elif [ -d "${HOME}/Library/Android/sdk" ]; then
            ANDROID_HOME="${HOME}/Library/Android/sdk"
        else
            ANDROID_HOME="${HOME}/Android/Sdk"
        fi
    fi
    export ANDROID_HOME
    export ANDROID_SDK_ROOT="${ANDROID_HOME}"
    if [ ! -d "${ANDROID_HOME}" ]; then
        echo "❌ Android SDK not found: ${ANDROID_HOME}" >&2
        exit 1
    fi
}

configure_java() {
    if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
        if [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
            JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
        elif [ -d "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ]; then
            JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
        elif command -v /usr/libexec/java_home >/dev/null 2>&1; then
            JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null \
                || /usr/libexec/java_home -v 21 2>/dev/null || true)
        fi
    fi
    export JAVA_HOME
    if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
        echo "❌ JDK 17 or newer was not found." >&2
        exit 1
    fi
}

export PATH="${HOME}/go/bin:/usr/local/go/bin:/opt/homebrew/bin:${PATH}"

command -v wails3 >/dev/null 2>&1 || { echo "❌ wails3 is not installed." >&2; exit 1; }
command -v go >/dev/null 2>&1 || { echo "❌ Go is not installed." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is not installed." >&2; exit 1; }

configure_android_sdk
configure_java

VERSION="$(read_app_version)"
VERSION_CODE="${ANDROID_VERSION_CODE:-$(calculate_version_code "${VERSION}")}"
if ! [[ "${VERSION_CODE}" =~ ^[1-9][0-9]*$ ]]; then
    echo "❌ ANDROID_VERSION_CODE must be a positive integer: ${VERSION_CODE}" >&2
    exit 1
fi
sync_product_version
sync_frontend_dependencies
mkdir -p "${OUT_DIR}"

echo "============================================================"
echo " DKST Markdown Browser — Android Build"
echo " Format       : ${FORMAT}"
echo " Architecture : ${ARCH}"
echo " App version  : ${VERSION} (${VERSION_CODE})"
echo " Android SDK  : ${ANDROID_HOME}"
echo "============================================================"

if [ -n "${ANDROID_KEYSTORE_FILE:-}" ] && [ ! -f "${ANDROID_KEYSTORE_FILE}" ]; then
    echo "❌ Android keystore not found: ${ANDROID_KEYSTORE_FILE}" >&2
    exit 1
fi

if [ -z "${ANDROID_KEYSTORE_FILE:-}" ]; then
    echo "⚠️  No release keystore supplied; the artifact will use the debug signing key."
else
    for required_variable in ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
        if [ -z "${!required_variable:-}" ]; then
            echo "❌ ${required_variable} is required when ANDROID_KEYSTORE_FILE is set." >&2
            exit 1
        fi
    done
fi

if [ "${FORMAT}" = "apk" ]; then
    EXTENSION="apk"
    if [ "${ARCH}" = "universal" ]; then
        TASK="android:package:fat"
    else
        TASK="android:package"
    fi
else
    EXTENSION="aab"
    if [ "${ARCH}" = "universal" ]; then
        TASK="android:bundle:fat"
    else
        TASK="android:bundle"
    fi
fi

echo "🔨 Building Android ${FORMAT}..."
if [ "${ARCH}" = "universal" ]; then
    wails3 task "${TASK}"
else
    wails3 task "${TASK}" "ARCH=${ARCH}"
fi

SOURCE_ARTIFACT="./build/bin/${APP_NAME}.${EXTENSION}"
OUTPUT_ARTIFACT="${OUT_DIR}/${APP_NAME}-${VERSION}-android-${ARCH}.${EXTENSION}"
if [ ! -f "${SOURCE_ARTIFACT}" ]; then
    echo "❌ Build artifact not found: ${SOURCE_ARTIFACT}" >&2
    exit 1
fi
cp -f "${SOURCE_ARTIFACT}" "${OUTPUT_ARTIFACT}"

echo "✅ Build completed: ${OUTPUT_ARTIFACT}"
