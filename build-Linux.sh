#!/usr/bin/env bash
# ============================================================
# build-Linux.sh — DINKIssTyle Markdown Browser Linux Build
# Created by DINKIssTyle on 2026.
# Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
# ============================================================
set -euo pipefail

APP_NAME="DKST Markdown Browser"
ARCH="${1:-amd64}"   # amd64 | arm64 | arm (default amd64)
OUT_DIR="./dist/linux"
CONFIG_FILE="internal/app/config.go"
APP_VERSION_LDFLAG="dinkisstyle-markdown-browser/internal/app.AppVersion"

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
    perl -0pi -e 's/^  version: "[^"]+"/  version: "'"${VERSION}"'"/m' build/config.yml
}

VERSION="$(read_app_version)"

echo "============================================================"
echo " DKST Markdown Browser — Linux Build"
echo " Architecture : ${ARCH}"
echo " Version      : ${VERSION}"
echo "============================================================"

# --- 1. Sudo Check ---
SUDO=""
if [ "$EUID" -ne 0 ]; then
    if command -v sudo &> /dev/null; then
        SUDO="sudo"
    fi
fi

# --- 2. Go Check ---
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install it first (https://go.dev/dl/)."
    exit 1
fi
echo "Using Go: $(go version | awk '{print $3}')"

sync_wails_product_version

# --- 3. System Dependencies (Auto-install) ---
echo "Checking system dependencies..."
if ! pkg-config --exists gtk+-3.0 || (! pkg-config --exists webkit2gtk-4.0 && ! pkg-config --exists webkit2gtk-4.1); then
    echo "⚠️  Missing dependencies. Attempting installation..."
    if command -v apt-get &> /dev/null; then
        $SUDO apt-get update
        $SUDO apt-get install -y build-essential libgtk-3-dev pkg-config libwebkit2gtk-4.1-dev || $SUDO apt-get install -y libwebkit2gtk-4.0-dev
    elif command -v dnf &> /dev/null; then
        $SUDO dnf groupinstall -y "Development Tools"
        $SUDO dnf install -y gtk3-devel pkgconf-pkg-config webkit2gtk4.1-devel || $SUDO dnf install -y webkit2gtk3-devel
    elif command -v pacman &> /dev/null; then
        $SUDO pacman -Sy --noconfirm base-devel gtk3 webkit2gtk
    elif command -v apk &> /dev/null; then
        $SUDO apk update
        $SUDO apk add build-base gtk+3.0-dev webkit2gtk-dev pkgconf
    fi
else
    echo "✅ All system dependencies met."
fi

# --- 4. Wails Check & Path ---
export PATH=$PATH:$(go env GOPATH)/bin
if ! command -v wails3 &> /dev/null; then
    echo "⚠️  Wails 3 CLI not found. Installing..."
    go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.3
    if ! command -v wails3 &> /dev/null; then
        echo "❌ Failed to install Wails."
        exit 1
    fi
fi
# Show Wails version without color indicators for cleaner log
echo "Using Wails: $(wails3 version 2>/dev/null || echo "installed")"

# --- 4.5. Frontend Dependency Sync ---
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js and npm first."
    exit 1
fi

echo "Refreshing frontend dependencies..."
pushd frontend > /dev/null
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi
popd > /dev/null

# --- 5. WebKit Build Tags ---
BUILD_TAGS=""
if pkg-config --exists webkit2gtk-4.1; then
    echo "Found webkit2gtk-4.1, adding build tag..."
    BUILD_TAGS="-tags webkit2_41"
fi

# --- 6. Build Execution ---
mkdir -p "${OUT_DIR}"
echo "🔨 Starting Linux ${ARCH} build..."

case "${ARCH}" in
    amd64|arm64|arm)
        wails3 task build GOOS=linux ARCH="${ARCH}" VERSION="${VERSION}"
        ;;
    *)
        echo "❌ Unknown architecture: ${ARCH} (amd64 | arm64 | arm)"
        exit 1
        ;;
esac

# --- 7. Result Copy ---
BIN_PATH="./bin/${APP_NAME}"
if [ -f "${BIN_PATH}" ]; then
    OUT_BIN="${OUT_DIR}/${APP_NAME}-${VERSION}-linux-${ARCH}"
    cp "${BIN_PATH}" "${OUT_BIN}"
    chmod +x "${OUT_BIN}"
    echo ""
    echo "✅ Build completed!"
    echo "   Output Path : ${OUT_BIN}"
else
    echo "❌ Error: Executable not found at ${BIN_PATH}"
    exit 1
fi
