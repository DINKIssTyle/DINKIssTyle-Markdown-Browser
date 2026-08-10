// Command patch_xcode_project restores the maintained Xcode project and
// runtime-critical files after `wails3 ios xcode:gen` regenerates them.
package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

const (
	templatePath       = "build/ios/project.pbxproj"
	projectPath        = "build/ios/xcode/main.xcodeproj/project.pbxproj"
	infoPlistPath      = "build/ios/xcode/main/Info.plist"
	maintainedMainPath = "build/ios/main.m"
	generatedMainPath  = "build/ios/xcode/main/main.m"
	maintainedLaunch   = "build/ios/LaunchScreen.storyboard"
	generatedLaunch    = "build/ios/xcode/main/LaunchScreen.storyboard"
)

var (
	executableEntry    = regexp.MustCompile(`(?s)(<key>CFBundleExecutable</key>\s*<string>)[^<]*(</string>)`)
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
)

func main() {
	template := mustRead(templatePath)
	for _, required := range [][]byte{
		[]byte("Prebuild: Wails Go Archive"),
		[]byte("PBXResourcesBuildPhase"),
		[]byte("CODE_SIGNING_ALLOWED = YES"),
		[]byte(`CODE_SIGN_STYLE = Automatic`),
		[]byte(`OTHER_LDFLAGS = "-all_load"`),
	} {
		if !bytes.Contains(template, required) {
			fail("validate maintained Xcode project", fmt.Errorf("missing %q", required))
		}
	}

	mustWrite(projectPath, template)
	mustWrite(generatedMainPath, mustRead(maintainedMainPath))
	mustWrite(generatedLaunch, mustRead(maintainedLaunch))

	plist := mustRead(infoPlistPath)
	patched := executableEntry.ReplaceAll(plist, []byte(`${1}$(EXECUTABLE_NAME)${2}`))
	if bytes.Equal(plist, patched) && !bytes.Contains(plist, []byte("$(EXECUTABLE_NAME)")) {
		fail("patch generated Info.plist", fmt.Errorf("CFBundleExecutable entry not found"))
	}
	if !bytes.Contains(patched, []byte("<key>UIApplicationSceneManifest</key>")) {
		closingRoot := []byte("</dict>\n</plist>")
		index := bytes.LastIndex(patched, closingRoot)
		if index < 0 {
			fail("patch generated Info.plist", fmt.Errorf("root dictionary closing tag not found"))
		}
		patched = bytes.Join([][]byte{patched[:index], sceneManifest, patched[index:]}, nil)
	}
	mustWrite(infoPlistPath, trailingWhitespace.ReplaceAll(patched, []byte("\n")))
}

func mustRead(path string) []byte {
	data, err := os.ReadFile(path)
	if err != nil {
		fail("read "+path, err)
	}
	return data
}

func mustWrite(path string, data []byte) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		fail("create parent directory for "+path, err)
	}
	mode := os.FileMode(0o644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode()
	}
	if current, err := os.ReadFile(path); err == nil && bytes.Equal(current, data) {
		return
	}
	if err := os.WriteFile(path, data, mode); err != nil {
		fail("write "+path, err)
	}
}

func fail(action string, err error) {
	fmt.Fprintf(os.Stderr, "error: %s: %v\n", action, err)
	os.Exit(1)
}
