#!/bin/sh

# Build the frontend and the Wails Go archive from an Xcode Run Script phase.
# Xcode launched from Finder does not inherit the user's login-shell PATH, so
# include the common Go and Node installation locations explicitly.
set -eu

NVM_NODE=$(ls -d "${HOME}"/.nvm/versions/node/v* 2>/dev/null | tail -n 1 || true)
if [ -n "${NVM_NODE}" ]; then
  PATH="${NVM_NODE}/bin:${PATH}"
fi
PATH="${HOME}/.volta/bin:${HOME}/.local/share/fnm:${HOME}/.asdf/shims:${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/local/go/bin:${HOME}/go/bin:${PATH}"
export PATH

APP_ROOT=$(cd "${PROJECT_DIR}/../../.." && pwd)
cd "${APP_ROOT}"

# Keep compiler caches inside Xcode's DerivedData. This avoids assumptions
# about a writable shell cache directory and also works in sandboxed CI jobs.
BUILD_CACHE_ROOT=${PROJECT_TEMP_DIR:-${TMPDIR:-/tmp}/wails-ios-build}
export GOCACHE="${BUILD_CACHE_ROOT}/GoBuildCache"
export CLANG_MODULE_CACHE_PATH="${BUILD_CACHE_ROOT}/ClangModuleCache"
mkdir -p "${GOCACHE}" "${CLANG_MODULE_CACHE_PATH}"

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: $1 was not found in Xcode's PATH." >&2
    echo "Install the project toolchain, then reopen Xcode." >&2
    exit 1
  fi
}

require_tool go
require_tool wails3
require_tool npm
require_tool xcrun

EXPECTED_WAILS=$(go list -m -f '{{.Version}}' github.com/wailsapp/wails/v3)
# Wails writes its version to stderr when stdout is not attached to a terminal
# (which is the normal environment for an Xcode Run Script phase).
INSTALLED_WAILS=$(wails3 version 2>&1)
if [ "${INSTALLED_WAILS}" != "${EXPECTED_WAILS}" ]; then
  echo "error: Wails CLI ${INSTALLED_WAILS} does not match go.mod (${EXPECTED_WAILS})." >&2
  echo "Run: go install github.com/wailsapp/wails/v3/cmd/wails3@${EXPECTED_WAILS}" >&2
  exit 1
fi

if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies..."
  if [ -f frontend/package-lock.json ]; then
    npm --prefix frontend ci
  else
    npm --prefix frontend install
  fi
fi

echo "Building frontend bundle..."
npm --prefix frontend run build
if [ ! -f frontend/dist/index.html ]; then
  echo "error: frontend/dist/index.html was not generated." >&2
  exit 1
fi

mkdir -p build/ios/xcode bin
echo "Generating the machine-local iOS overlay..."
wails3 ios overlay:gen -out build/ios/xcode/overlay.json -config build/config.yml

PLATFORM=${PLATFORM_NAME:-iphonesimulator}
MIN_IOS_VERSION=${IPHONEOS_DEPLOYMENT_TARGET:-15.0}
ARCH_NAME=${CURRENT_ARCH:-${NATIVE_ARCH_ACTUAL:-arm64}}
if [ "${ARCH_NAME}" = "undefined_arch" ]; then
  ARCH_NAME=${NATIVE_ARCH_ACTUAL:-arm64}
fi

case "${ARCH_NAME}" in
  x86_64)
    GOARCH=amd64
    TARGET_ARCH=x86_64
    ;;
  arm64|arm64e)
    GOARCH=arm64
    TARGET_ARCH=arm64
    ;;
  *)
    echo "error: unsupported Xcode architecture: ${ARCH_NAME}" >&2
    exit 1
    ;;
esac

if [ "${PLATFORM}" = "iphonesimulator" ]; then
  GO_TARGET="${TARGET_ARCH}-apple-ios${MIN_IOS_VERSION}-simulator"
  MIN_FLAG="-mios-simulator-version-min=${MIN_IOS_VERSION}"
else
  GO_TARGET="arm64-apple-ios${MIN_IOS_VERSION}"
  MIN_FLAG="-miphoneos-version-min=${MIN_IOS_VERSION}"
  GOARCH=arm64
fi

if [ -d "${SDKROOT:-}" ]; then
  SDK_PATH=${SDKROOT}
else
  SDK_PATH=$(xcrun --sdk "${PLATFORM}" --show-sdk-path)
fi

export GOOS=ios
export GOARCH
export CGO_ENABLED=1
export CC
CC=$(xcrun --sdk "${PLATFORM}" --find clang)
export CGO_CFLAGS="-isysroot ${SDK_PATH} -target ${GO_TARGET} ${MIN_FLAG}"
export CGO_LDFLAGS="-isysroot ${SDK_PATH} -target ${GO_TARGET} ${MIN_FLAG}"

echo "Building Go c-archive for ${PLATFORM} (${GO_TARGET})..."
go build \
  -buildmode=c-archive \
  -overlay build/ios/xcode/overlay.json \
  -tags ios \
  -buildvcs=false \
  -o "bin/DKST Markdown Browser.a"
