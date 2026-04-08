#!/usr/bin/env bash
# ============================================================
# build-Linux.sh — DINKIssTyle Markdown Browser Linux Build
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
if ! command -v wails &> /dev/null; then
    echo "⚠️  Wails CLI not found. Installing..."
    go install github.com/wailsapp/wails/v2/cmd/wails@latest
    if ! command -v wails &> /dev/null; then
        echo "❌ Failed to install Wails."
        exit 1
    fi
fi
# Show Wails version without color indicators for cleaner log
echo "Using Wails: $(wails version 2>/dev/null | grep "Wails CLI" | awk '{print $3}' || echo "installed")"

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
        wails build \
            -platform "linux/${ARCH}" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            ${BUILD_TAGS} \
            -clean
        ;;
    *)
        echo "❌ Unknown architecture: ${ARCH} (amd64 | arm64 | arm)"
        exit 1
        ;;
esac

# --- 7. Result Copy ---
BIN_PATH="./build/bin/${APP_NAME}"
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
