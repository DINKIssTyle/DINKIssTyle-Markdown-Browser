#!/usr/bin/env bash

set -euo pipefail

ARCH="${1:-universal}"
OUTPUT="${2:-}"
SOURCE="build/apple-intelligence/AppleIntelligenceBridge.swift"

if [[ -z "${OUTPUT}" ]]; then
    echo "usage: $0 <arm64|amd64|universal> <output.dylib>" >&2
    exit 2
fi

if ! command -v xcrun >/dev/null 2>&1; then
    echo "Apple Intelligence bridge requires Xcode 26 or later." >&2
    exit 1
fi

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
if [[ ! -d "${SDK_PATH}/System/Library/Frameworks/FoundationModels.framework" ]]; then
    echo "FoundationModels.framework was not found. Install Xcode 26 or later." >&2
    exit 1
fi

MODULE_CACHE="$(mktemp -d /tmp/dkst-swift-module-cache.XXXXXX)"
BUILD_DIR="$(mktemp -d /tmp/dkst-apple-intelligence.XXXXXX)"
trap 'rm -rf "${MODULE_CACHE}" "${BUILD_DIR}"' EXIT

compile_arch() {
    local target_arch="$1"
    local swift_arch="$target_arch"
    if [[ "${target_arch}" == "amd64" ]]; then
        swift_arch="x86_64"
    fi
    CLANG_MODULE_CACHE_PATH="${MODULE_CACHE}" SWIFT_MODULE_CACHE_PATH="${MODULE_CACHE}" \
        xcrun swiftc -parse-as-library -emit-library "${SOURCE}" \
        -module-name DKSTAppleIntelligenceBridge \
        -target "${swift_arch}-apple-macos12.0" \
        -sdk "${SDK_PATH}" \
        -Xlinker -weak_framework -Xlinker FoundationModels \
        -Xlinker -install_name -Xlinker "@rpath/libDKSTAppleIntelligence.dylib" \
        -o "${BUILD_DIR}/bridge-${target_arch}.dylib"
}

mkdir -p "$(dirname "${OUTPUT}")"
if [[ "${ARCH}" == "universal" ]]; then
    compile_arch arm64
    compile_arch amd64
    lipo -create -output "${OUTPUT}" "${BUILD_DIR}/bridge-arm64.dylib" "${BUILD_DIR}/bridge-amd64.dylib"
else
    compile_arch "${ARCH}"
    cp "${BUILD_DIR}/bridge-${ARCH}.dylib" "${OUTPUT}"
fi
