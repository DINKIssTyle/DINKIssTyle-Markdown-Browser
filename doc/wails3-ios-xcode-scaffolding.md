# Wails3 iOS/Xcode 휴대형 스캐폴딩 지침

이 문서는 Wails3가 생성하는 Xcode 프로젝트를 macOS 컴퓨터나 저장소 위치와 관계없이 빌드할 수 있게 구성하는 방법을 설명합니다. 이 저장소의 구성을 기준으로 하지만 앱 이름과 번들 ID만 바꾸면 다른 Wails3 프로젝트에도 적용할 수 있습니다.

## 해결하려는 문제

다음 오류는 Xcode의 Pre-build Script가 실행되기 전에 발생합니다.

```text
Build input file cannot be found: '.../build/ios/xcode/main/Info.plist'
```

Xcode는 `Info.plist`, Objective-C 진입점, Asset Catalog, Launch Screen 같은 빌드 입력을 먼저 검사합니다. 따라서 이 파일을 Pre-build Script에서 만들게 해서는 안 됩니다. 또한 Wails3의 다음 두 명령은 Xcode 관련 파일을 다시 만들거나 덮어씁니다.

```sh
wails3 ios xcode:gen -outdir build/ios/xcode -config build/config.yml
wails3 update build-assets -config build/config.yml -dir build
```

특히 Wails3 beta.6의 `update build-assets`는 `build/ios/project.pbxproj`를 갱신합니다. 이 파일을 사용자 수정의 중앙 원본으로 사용하면 링크, 리소스, 서명 설정이 다시 기본값으로 돌아갈 수 있습니다.

## 디렉터리 역할

```text
build/ios/
├── xcode-support/                 # Git에 커밋하는 유지 원본
│   ├── project.pbxproj            # 링크·리소스·서명·Pre-build 설정
│   ├── Info.plist                 # Xcode용 plist; 동기화 스크립트가 관리
│   ├── main.m                     # UIScene/Wails 진입점
│   ├── LaunchScreen.storyboard
│   └── Assets.xcassets/
├── scripts/
│   ├── patch_xcode_project.go     # 유지 원본을 생성 프로젝트에 반영
│   └── xcode_prebuild.sh          # 프런트엔드·overlay·Go archive 빌드
├── xcode/                         # Wails/Xcode 생성 산출물
│   ├── main.xcodeproj/
│   ├── main/
│   ├── overlay.json               # 컴퓨터별 절대 경로, Git 제외
│   └── gen/                       # 생성 Go 파일, Git 제외
├── Info.plist                     # Wails가 config.yml에서 갱신
└── Taskfile.yml
```

핵심 규칙은 간단합니다.

- `build/ios/xcode-support`는 사람이 유지하고 Git에 커밋합니다.
- `build/ios/xcode`는 생성 영역으로 취급합니다.
- Xcode 프로젝트의 필수 입력은 모두 `../xcode-support/...`를 참조합니다.
- 앱 버전, 번들 ID, 표시 이름은 Wails가 만든 `build/ios/Info.plist`에서 Xcode용 plist로 동기화합니다.
- Xcode 프로젝트를 다시 만든 직후에는 항상 복원 스크립트를 실행합니다.

## 이 저장소에서 사용하는 명령

최초 생성 또는 아이콘·Xcode 설정 동기화:

```sh
wails3 task ios:sync:xcode
```

동기화 후 Xcode 열기:

```sh
wails3 task ios:xcode
```

`build/config.yml`의 버전, 회사명, 번들 ID 등을 바꾼 뒤 전체 빌드 자산 갱신:

```sh
wails3 task common:update:build-assets
```

이 공통 작업은 Wails 갱신이 끝난 뒤 `patch_xcode_project.go`를 실행하므로 `build/ios/project.pbxproj`가 덮어써져도 유지 프로젝트는 손상되지 않습니다. 앱 아이콘 원본 `build/appicon.png`까지 바꿨다면 이어서 `ios:sync:xcode`를 실행해야 iOS별 PNG가 다시 생성됩니다.

일반 시뮬레이터 빌드 검증:

```sh
xcodebuild \
  -project build/ios/xcode/main.xcodeproj \
  -scheme "DKST Markdown Browser" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  CODE_SIGNING_ALLOWED=NO \
  build
```

실기기 빌드·설치·실행:

```sh
wails3 task ios:device:list
wails3 task ios:run:device DEVICE_ID=YOUR_UDID TEAM_ID=YOUR_TEAM_ID
```

Xcode에서 한 번 선택한 Development Team은 생성 프로젝트를 복원할 때 보존합니다. 팀 ID 자체는 여러 개발자가 공유하는 유지 템플릿에 고정하지 않습니다.

## 다른 Wails3 프로젝트에 적용하기

### 1. 도구 버전을 고정합니다

`go.mod`에 선언된 Wails 버전과 CLI 버전을 같게 맞춥니다.

```sh
WAILS_VERSION=$(go list -m -f '{{.Version}}' github.com/wailsapp/wails/v3)
go install github.com/wailsapp/wails/v3/cmd/wails3@"${WAILS_VERSION}"
```

`@latest`를 사용하면 개발 컴퓨터마다 생성 템플릿이 달라질 수 있습니다.

### 2. 유지 디렉터리를 만듭니다

새 프로젝트에서 한 번 `wails3 ios xcode:gen`을 실행한 뒤 다음 파일을 `build/ios/xcode-support`에 둡니다.

- 프로젝트 설정 원본 `project.pbxproj`
- UIKit 진입점 `main.m`
- `LaunchScreen.storyboard`
- 완전한 `Assets.xcassets` 디렉터리
- Xcode 빌드가 즉시 읽을 수 있는 `Info.plist`

모두 Git에 커밋해야 새 컴퓨터에서 Xcode를 바로 열 수 있습니다.

### 3. 프로젝트의 파일 참조를 생성 영역 밖으로 바꿉니다

`build/ios/xcode/main.xcodeproj`의 `SOURCE_ROOT`는 `build/ios/xcode`입니다. 따라서 유지 파일은 다음처럼 참조합니다.

```text
main.m                  -> ../xcode-support/main.m
Info.plist              -> ../xcode-support/Info.plist
Assets.xcassets         -> ../xcode-support/Assets.xcassets
LaunchScreen.storyboard -> ../xcode-support/LaunchScreen.storyboard
```

Debug와 Release 양쪽에 다음 설정이 있어야 합니다.

```text
INFOPLIST_FILE = "../xcode-support/Info.plist";
ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
CODE_SIGNING_ALLOWED = YES;
CODE_SIGN_STYLE = Automatic;
ENABLE_USER_SCRIPT_SANDBOXING = NO;
OTHER_LDFLAGS = "-all_load";
SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
```

Asset Catalog와 Launch Screen은 `PBXResourcesBuildPhase`에 포함합니다. Go c-archive는 저장소 루트의 `bin/<앱 이름>.a`를 참조합니다.

앱 표시 이름에 공백이 있더라도 Xcode의 `PRODUCT_NAME`과 실제 실행 파일 이름에는 공백 없는 이름을 쓰는 편이 안전합니다. 이 저장소는 표시 이름은 `DKST Markdown Browser`, 제품 이름은 `DKSTMarkdownBrowser`로 분리합니다. 이는 일부 Go/iOS 조합에서 앱 번들 경로의 `%20` 때문에 `runtime/cgo: chdir(...) failed`가 발생하는 문제도 피합니다.

### 4. 복원 스크립트를 연결합니다

`patch_xcode_project.go`는 다음 작업을 해야 합니다.

1. `xcode-support/project.pbxproj`가 필요한 링크·리소스·서명 설정을 포함하는지 검사
2. 생성된 `main.xcodeproj/project.pbxproj`에 유지 원본 복사
3. 기존 생성 프로젝트의 `DEVELOPMENT_TEAM`이 있으면 보존
4. Wails가 갱신한 `build/ios/Info.plist`를 `xcode-support/Info.plist`로 동기화
5. `CFBundleExecutable`을 `$(EXECUTABLE_NAME)`으로 설정
6. 최신 SDK에 필요한 `UIApplicationSceneManifest`와 `WailsSceneDelegate` 확인
7. `xcode:gen`이 만든 iOS 아이콘을 유지 Asset Catalog로 복사

스크립트는 저장소 루트와 `build` 디렉터리 어디에서 실행해도 루트를 스스로 찾게 만듭니다. 그래야 `common:update:build-assets`의 `dir: build` 안에서도 같은 스크립트를 사용할 수 있습니다.

### 5. Xcode Pre-build를 컴퓨터 독립적으로 만듭니다

Finder에서 연 Xcode는 로그인 셸의 PATH를 그대로 받지 않습니다. Pre-build Script에서 Homebrew, Go, NVM, Volta, fnm 등의 일반 경로를 명시하고 다음 순서로 실행합니다.

1. `go`, `wails3`, `npm`, `xcrun` 존재 확인
2. Wails CLI와 `go.mod` 버전 일치 확인
3. 프런트엔드 의존성 설치 및 `frontend/dist` 빌드
4. 컴퓨터별 `build/ios/xcode/overlay.json` 생성
5. 현재 SDK, 플랫폼, 아키텍처에 맞는 CGO 플래그 구성
6. 저장소 루트 `bin`에 Go c-archive 생성

`overlay.json`에는 절대 경로가 들어가므로 커밋하지 않습니다. 생성 실패를 `|| true`로 숨기지 않아야 이후 오류가 정확한 원인에서 멈춥니다.

### 6. Taskfile에 생성→복원 순서를 고정합니다

앱별 iOS Task는 반드시 다음 순서를 한 작업으로 묶습니다.

```yaml
cmds:
  - wails3 ios xcode:gen -outdir build/ios/xcode -config build/config.yml
  - go run build/ios/scripts/patch_xcode_project.go
```

공통 `update:build-assets`에도 Wails 명령 뒤에 복원 스크립트를 둡니다.

```yaml
dir: build
cmds:
  - wails3 update build-assets -name "{{.APP_NAME}}" -binaryname "{{.APP_NAME}}" -config config.yml -dir .
  - go run ios/scripts/patch_xcode_project.go
```

## 커밋 및 제외 기준

Git에 포함:

- `build/ios/xcode-support/**`
- `build/ios/scripts/patch_xcode_project.go`
- `build/ios/scripts/xcode_prebuild.sh`
- 다른 개발자가 바로 열어야 한다면 복원된 `build/ios/xcode/main.xcodeproj/project.pbxproj`

Git에서 제외:

- `build/ios/xcode/overlay.json`
- `build/ios/xcode/gen/`
- `build/ios/DerivedData/`
- `**/xcuserdata/`
- `**/UserInterfaceState.xcuserstate`
- 저장소 루트 `bin/`

## 변경 후 검증 체크리스트

```sh
go run build/ios/scripts/patch_xcode_project.go
plutil -lint build/ios/xcode-support/Info.plist
xcodebuild -project build/ios/xcode/main.xcodeproj -scheme "앱 이름" -showBuildSettings
```

확인할 항목:

- `INFOPLIST_FILE`이 `xcode-support/Info.plist`를 가리키는가
- Debug와 Release 모두 자동 서명과 `-all_load`를 사용하는가
- Resources 단계에 Asset Catalog와 Launch Screen이 있는가
- `Info.plist`에 `UIApplicationSceneManifest`가 있는가
- `main.m`에 `WailsSceneDelegate`가 구현되어 있는가
- 새 클론에서 `frontend/dist`, overlay, `bin/*.a`가 Xcode 빌드 중 생성되는가
- 시뮬레이터와 `generic/platform=iOS` 양쪽에서 빌드되는가

## 오류별 확인 지점

| 오류 | 원인 및 확인 위치 |
|---|---|
| `Build input file cannot be found ... Info.plist` | 프로젝트가 생성 영역의 plist를 참조하는지 확인 |
| `UIScene life cycle is required` | 유지 plist의 Scene Manifest와 `main.m`의 Scene Delegate 확인 |
| `runtime/cgo: chdir(...%20...) failed` | 공백 없는 `PRODUCT_NAME`과 `CFBundleExecutable=$(EXECUTABLE_NAME)` 확인 |
| `go` 또는 `wails3: command not found` | Xcode Pre-build의 PATH와 CLI 설치 버전 확인 |
| `frontend/dist: no matching files` | Pre-build의 프런트엔드 빌드 확인 |
| `overlay.json: no such file` | 컴퓨터별 overlay 생성을 실패로 숨기지 않았는지 확인 |
| `No class named WailsAppDelegate is loaded` | `main.m` 직접 참조, `-all_load`, archive 링크 확인 |
| 서명/Provisioning 오류 | Team 선택, Bundle ID, 자동 서명 설정 확인 |

이 구조에서는 Wails가 표준 빌드 자산을 다시 생성해도 사용자 유지 Xcode 구성이 별도 디렉터리에 남습니다. 생성 명령과 복원 명령을 항상 한 Task로 실행하는 것이 재발 방지의 핵심입니다.
