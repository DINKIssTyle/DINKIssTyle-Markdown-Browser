// Command patch_xcode_project restores the maintained Xcode project after
// `wails3 ios xcode:gen` or `wails3 update build-assets` regenerates Wails files.
//
// The generated Xcode project only points at files under xcode-support. This is
// deliberate: Xcode validates Info.plist and resources before it runs build
// phases, so none of those inputs may depend on the prebuild script.
package main

import (
	"bytes"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
)

const (
	supportProjectPath   = "build/ios/xcode-support/project.pbxproj"
	generatedProjectPath = "build/ios/xcode/main.xcodeproj/project.pbxproj"
	sourceInfoPath       = "build/ios/Info.plist"
	sourceDevInfoPath    = "build/ios/Info.dev.plist"
	supportInfoPath      = "build/ios/xcode-support/Info.plist"
	supportMainPath      = "build/ios/xcode-support/main.m"
	supportLaunchPath    = "build/ios/xcode-support/LaunchScreen.storyboard"
	generatedAssetsPath  = "build/ios/xcode/main/Assets.xcassets"
	supportAssetsPath    = "build/ios/xcode-support/Assets.xcassets"
)

var (
	executableEntry    = regexp.MustCompile(`(?s)(<key>CFBundleExecutable</key>\s*<string>)[^<]*(</string>)`)
	developmentTeam    = regexp.MustCompile(`(?m)^\s*DEVELOPMENT_TEAM = ([A-Za-z0-9]+);\s*$`)
	codeSignStyleEntry = regexp.MustCompile(`(?m)^([ \t]*CODE_SIGN_STYLE = Automatic;)[ \t]*$`)
	trailingWhitespace = regexp.MustCompile(`[ \t]+\n`)
	sceneManifest      = []byte(`    <key>UIApplicationSceneManifest</key>
    <dict>
        <key>UIApplicationSupportsMultipleScenes</key>
        <false/>
        <key>UISceneConfigurations</key>
        <dict>
            <key>UIWindowSceneSessionRoleApplication</key>
            <array>
                <dict>
                    <key>UISceneConfigurationName</key>
                    <string>Default Configuration</string>
                    <key>UISceneDelegateClassName</key>
                    <string>WailsSceneDelegate</string>
                </dict>
            </array>
        </dict>
    </dict>
`)
	documentTypeEntry = []byte(`		<key>CFBundleDocumentTypes</key>
		<array>
			<dict>
				<key>CFBundleTypeName</key>
				<string>Markdown Document</string>
				<key>CFBundleTypeRole</key>
				<string>Editor</string>
				<key>LSHandlerRank</key>
				<string>Alternate</string>
				<key>LSItemContentTypes</key>
				<array>
					<string>net.daringfireball.markdown</string>
				</array>
			</dict>
		</array>
`)
	fileSharingEntry = []byte(`		<key>UIFileSharingEnabled</key>
		<true/>
`)
	openInPlaceEntry = []byte(`		<key>LSSupportsOpeningDocumentsInPlace</key>
		<true/>
`)
	exportComplianceEntry = []byte(`		<key>ITSAppUsesNonExemptEncryption</key>
		<false/>
`)
	cfVersionPattern         = regexp.MustCompile(`(?s)(<key>CFBundleVersion</key>\s*<string>)[^<]*(</string>)`)
	cfShortVersionPattern    = regexp.MustCompile(`(?s)(<key>CFBundleShortVersionString</key>\s*<string>)[^<]*(</string>)`)
	configYamlVersionPattern = regexp.MustCompile(`(?m)^(\s*version:\s*")[^"]+(")`)
	appVersionPattern        = regexp.MustCompile(`(?m)^\s*(?:var\s+)?AppVersion\s*=\s*"([^"]+)"`)
)

func main() {
	root := findProjectRoot()
	path := func(relative string) string { return filepath.Join(root, filepath.FromSlash(relative)) }

	// Read app version from internal/app/config.go
	appVersion := readAppVersion(path("internal/app/config.go"))
	if appVersion != "" {
		syncConfigYamlVersion(path("build/config.yml"), appVersion)
	}

	project := mustRead(path(supportProjectPath))
	for _, required := range [][]byte{
		[]byte("Prebuild: Wails Go Archive"),
		[]byte("PBXResourcesBuildPhase"),
		[]byte("CODE_SIGNING_ALLOWED = YES"),
		[]byte(`CODE_SIGN_STYLE = Automatic`),
		[]byte(`OTHER_LDFLAGS = "-all_load"`),
		[]byte(`INFOPLIST_FILE = "../xcode-support/Info.plist"`),
		[]byte(`path = "../xcode-support/main.m"`),
		[]byte(`path = "../xcode-support/Assets.xcassets"`),
	} {
		if !bytes.Contains(project, required) {
			fail("validate maintained Xcode project", fmt.Errorf("missing %q", required))
		}
	}
	// Xcode writes the selected development team into the generated project.
	// Preserve that machine-local choice while restoring every portable setting.
	if existing, err := os.ReadFile(path(generatedProjectPath)); err == nil {
		if match := developmentTeam.FindSubmatch(existing); len(match) == 2 {
			teamLine := []byte("\n\t\t\t\tDEVELOPMENT_TEAM = " + string(match[1]) + ";")
			project = codeSignStyleEntry.ReplaceAll(project, append([]byte("${1}"), teamLine...))
		}
	}
	mustWrite(path(generatedProjectPath), project)

	mainSource := mustRead(path(supportMainPath))
	for _, required := range [][]byte{
		[]byte("WailsAppDelegate"),
		[]byte("WailsSceneDelegate"),
		[]byte("WailsIOSOpenFile"),
		[]byte("openURLContexts"),
		[]byte("UIApplicationMain"),
	} {
		if !bytes.Contains(mainSource, required) {
			fail("validate maintained iOS entry point", fmt.Errorf("missing %q", required))
		}
	}
	if !bytes.Contains(mustRead(path(supportLaunchPath)), []byte("<document type=\"com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB\"")) {
		fail("validate maintained launch screen", fmt.Errorf("storyboard document is invalid"))
	}

	// build/ios/Info.plist is refreshed from build/config.yml by Wails. Keep
	// the Xcode-owned copy in sync, while retaining the executable and scene
	// values required by the portable project.
	plist := addDocumentIntegration(mustRead(path(sourceInfoPath)))
	if appVersion != "" {
		plist = syncVersion(plist, appVersion, appVersion)
	}
	// The command-line package task uses this file directly, so keep the
	// portable source plist augmented as well as the Xcode-owned copy.
	mustWrite(path(sourceInfoPath), plist)
	if isFile(path(sourceDevInfoPath)) {
		devPlist := addDocumentIntegration(mustRead(path(sourceDevInfoPath)))
		if appVersion != "" {
			devPlist = syncVersion(devPlist, appVersion+"-dev", appVersion)
		}
		mustWrite(path(sourceDevInfoPath), devPlist)
	}
	patched := executableEntry.ReplaceAll(plist, []byte(`${1}$(EXECUTABLE_NAME)${2}`))
	if bytes.Equal(plist, patched) && !bytes.Contains(plist, []byte("$(EXECUTABLE_NAME)")) {
		fail("patch Xcode Info.plist", fmt.Errorf("CFBundleExecutable entry not found"))
	}
	if !bytes.Contains(patched, []byte("<key>UIApplicationSceneManifest</key>")) {
		patched = insertBeforeRootClosing(patched, sceneManifest)
	}
	patched = trailingWhitespace.ReplaceAll(patched, []byte("\n"))
	patched = append(bytes.TrimRight(patched, "\n"), '\n')
	mustWrite(path(supportInfoPath), patched)

	// xcode:gen creates all icon renditions from build/appicon.png. Copy those
	// generated renditions into the committed support directory so direct Xcode
	// builds also work immediately after a fresh clone.
	if info, err := os.Stat(path(generatedAssetsPath)); err == nil && info.IsDir() {
		mustCopyTree(path(generatedAssetsPath), path(supportAssetsPath))
	}
	if info, err := os.Stat(path(supportAssetsPath)); err != nil || !info.IsDir() {
		fail("validate maintained asset catalog", fmt.Errorf("%s is missing", supportAssetsPath))
	}
}

func readAppVersion(configPath string) string {
	if !isFile(configPath) {
		return ""
	}
	content := mustRead(configPath)
	m := appVersionPattern.FindSubmatch(content)
	if len(m) < 2 {
		return ""
	}
	return string(m[1])
}

func syncConfigYamlVersion(configYamlPath string, version string) {
	if !isFile(configYamlPath) || version == "" {
		return
	}
	content := mustRead(configYamlPath)
	updated := configYamlVersionPattern.ReplaceAll(content, []byte("${1}"+version+"${2}"))
	mustWrite(configYamlPath, updated)
}

func syncVersion(plist []byte, shortVersion string, bundleVersion string) []byte {
	plist = cfShortVersionPattern.ReplaceAll(plist, []byte("${1}"+shortVersion+"${2}"))
	plist = cfVersionPattern.ReplaceAll(plist, []byte("${1}"+bundleVersion+"${2}"))
	return plist
}

func addDocumentIntegration(plist []byte) []byte {
	for _, entry := range []struct {
		key string
		xml []byte
	}{
		{key: "CFBundleDocumentTypes", xml: documentTypeEntry},
		{key: "UIFileSharingEnabled", xml: fileSharingEntry},
		{key: "LSSupportsOpeningDocumentsInPlace", xml: openInPlaceEntry},
		{key: "ITSAppUsesNonExemptEncryption", xml: exportComplianceEntry},
	} {
		marker := []byte("<key>" + entry.key + "</key>")
		if bytes.Contains(plist, marker) {
			continue
		}
		plist = insertBeforeRootClosing(plist, entry.xml)
	}
	return plist
}

func insertBeforeRootClosing(plist []byte, entry []byte) []byte {
	closingRoot := []byte("</dict>\n</plist>")
	index := bytes.LastIndex(plist, closingRoot)
	if index < 0 {
		fail("patch iOS plist", fmt.Errorf("root dictionary closing tag not found"))
	}
	lineStart := bytes.LastIndex(plist[:index], []byte("\n")) + 1
	return bytes.Join([][]byte{plist[:lineStart], entry, plist[lineStart:]}, nil)
}

func findProjectRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		fail("get working directory", err)
	}
	for {
		if isFile(filepath.Join(dir, "go.mod")) && isFile(filepath.Join(dir, "build", "config.yml")) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			fail("find project root", fmt.Errorf("go.mod and build/config.yml not found above working directory"))
		}
		dir = parent
	}
}

func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func mustCopyTree(source, destination string) {
	err := filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return writeFileIfChanged(target, mustRead(path), entry.Type().Perm())
	})
	if err != nil {
		fail("copy generated asset catalog", err)
	}
}

func mustRead(path string) []byte {
	data, err := os.ReadFile(path)
	if err != nil {
		fail("read "+path, err)
	}
	return data
}

func mustWrite(path string, data []byte) {
	mode := os.FileMode(0o644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode()
	}
	if err := writeFileIfChanged(path, data, mode); err != nil {
		fail("write "+path, err)
	}
}

func writeFileIfChanged(path string, data []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if current, err := os.ReadFile(path); err == nil && bytes.Equal(current, data) {
		return nil
	}
	if mode.Perm() == 0 {
		mode = 0o644
	}
	return os.WriteFile(path, data, mode.Perm())
}

func fail(action string, err error) {
	fmt.Fprintf(os.Stderr, "error: %s: %v\n", action, err)
	os.Exit(1)
}
