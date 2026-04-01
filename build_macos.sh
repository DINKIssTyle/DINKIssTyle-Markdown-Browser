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
ARCH="${1:-universal}"   # arm64 | amd64 | universal (기본값)
OUT_DIR="./dist/macos"

echo "============================================================"
echo " DKST Markdown Browser — macOS Build"
echo " Architecture : ${ARCH}"
echo " Bundle ID    : ${BUNDLE_ID}"
echo " Version      : ${VERSION}"
echo "============================================================"

# ── 의존성 확인 ──────────────────────────────────────────────
command -v wails >/dev/null 2>&1 || { echo "❌ wails 가 설치되어 있지 않습니다. 'go install github.com/wailsapp/wails/v2/cmd/wails@latest' 로 설치하세요."; exit 1; }
command -v go    >/dev/null 2>&1 || { echo "❌ Go 가 설치되어 있지 않습니다."; exit 1; }

mkdir -p "${OUT_DIR}"

# ── 아이콘 변환 (appicon.png → iconfile.icns) ─────────────
# build/darwin/iconfile.icns 가 유효한 파일이 아니면 png 에서 자동 생성 시도
ICNS_PATH="./build/darwin/iconfile.icns"
ICON_SRC="./build/appicon.png"
if [ ! -s "${ICNS_PATH}" ] && [ -f "${ICON_SRC}" ]; then
    echo "🖼  appicon.png → iconfile.icns 변환 중..."
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
    echo "   ✅ iconfile.icns 생성 완료"
else
    echo "🖼  iconfile.icns 사용 (기존)"
fi

# ── 빌드 실행 ─────────────────────────────────────────────
case "${ARCH}" in
    universal)
        echo "🔨 Universal Binary 빌드 시작 (arm64 + amd64)..."
        wails build \
            -platform "darwin/universal" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    arm64)
        echo "🔨 Apple Silicon (arm64) 빌드 시작..."
        wails build \
            -platform "darwin/arm64" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    amd64)
        echo "🔨 Intel (amd64) 빌드 시작..."
        wails build \
            -platform "darwin/amd64" \
            -o "${APP_NAME}" \
            -ldflags "-X main.version=${VERSION}" \
            -clean
        ;;
    *)
        echo "❌ 알 수 없는 아키텍처: ${ARCH}  (arm64 | amd64 | universal)"
        exit 1
        ;;
esac

# ── .app 번들 복사 ─────────────────────────────────────────
APP_BUNDLE="./build/bin/${APP_NAME}.app"
if [ -d "${APP_BUNDLE}" ]; then
    cp -r "${APP_BUNDLE}" "${OUT_DIR}/"
    echo ""
    echo "✅ 빌드 완료!"
    echo "   출력 경로 : ${OUT_DIR}/${APP_NAME}.app"
    echo ""
    echo "📦 DMG 생성이 필요하면:"
    echo "   hdiutil create -volname '${APP_NAME}' -srcfolder '${OUT_DIR}/${APP_NAME}.app' \\"
    echo "     -ov -format UDZO '${OUT_DIR}/${APP_NAME}-${VERSION}-macos.dmg'"
else
    echo "⚠️  .app 번들을 찾을 수 없습니다: ${APP_BUNDLE}"
fi
