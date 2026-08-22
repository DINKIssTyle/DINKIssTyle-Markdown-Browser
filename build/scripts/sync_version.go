package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

func main() {
	rootDir, err := findRootDir()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error locating root dir: %v\n", err)
		os.Exit(1)
	}

	configPath := filepath.Join(rootDir, "internal", "app", "config.go")
	configData, err := os.ReadFile(configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading %s: %v\n", configPath, err)
		os.Exit(1)
	}

	versionRegex := regexp.MustCompile(`(?m)^\s*(?:var\s+)?AppVersion\s*=\s*"([^"]+)"`)
	matches := versionRegex.FindStringSubmatch(string(configData))
	if len(matches) < 2 {
		fmt.Fprintf(os.Stderr, "Error: AppVersion not found in %s\n", configPath)
		os.Exit(1)
	}

	version := matches[1]
	versionCode := calculateVersionCode(version)
	fourPartVersion := version
	parts := strings.Split(strings.Split(version, "-")[0], ".")
	if len(parts) == 3 {
		fourPartVersion = fmt.Sprintf("%s.0", strings.Split(version, "-")[0])
	}

	fmt.Printf("Syncing AppVersion=%s (code=%d) across project files...\n", version, versionCode)

	// 1. build/config.yml
	replaceInFile(filepath.Join(rootDir, "build", "config.yml"),
		regexp.MustCompile(`(?m)^  version: "[^"]+"`),
		fmt.Sprintf(`  version: "%s"`, version))

	// 2. build/windows/info.json
	replaceInFile(filepath.Join(rootDir, "build", "windows", "info.json"),
		regexp.MustCompile(`"file_version":\s*"[^"]+"`),
		fmt.Sprintf(`"file_version": "%s"`, version))
	replaceInFile(filepath.Join(rootDir, "build", "windows", "info.json"),
		regexp.MustCompile(`"ProductVersion":\s*"[^"]+"`),
		fmt.Sprintf(`"ProductVersion": "%s"`, version))

	// 3. build/windows/wails.exe.manifest (only target com.dinkisstyle.mdbrowser)
	replaceInFile(filepath.Join(rootDir, "build", "windows", "wails.exe.manifest"),
		regexp.MustCompile(`(<assemblyIdentity\b[^>]*\bname="com\.dinkisstyle\.mdbrowser"[^>]*\bversion=")[^"]+(")`),
		fmt.Sprintf(`${1}%s${2}`, version))

	// 4. build/windows/nsis/wails_tools.nsh
	replaceInFile(filepath.Join(rootDir, "build", "windows", "nsis", "wails_tools.nsh"),
		regexp.MustCompile(`!define INFO_PRODUCTVERSION\s+"[^"]+"`),
		fmt.Sprintf(`!define INFO_PRODUCTVERSION "%s"`, version))

	// 5. build/windows/msix/app_manifest.xml
	replaceInFile(filepath.Join(rootDir, "build", "windows", "msix", "app_manifest.xml"),
		regexp.MustCompile(`(\bVersion=")[^"]+(")`),
		fmt.Sprintf(`${1}%s${2}`, fourPartVersion))

	// 6. build/android/app/build.gradle
	replaceInFile(filepath.Join(rootDir, "build", "android", "app", "build.gradle"),
		regexp.MustCompile(`versionCode\s+\d+`),
		fmt.Sprintf(`versionCode %d`, versionCode))
	replaceInFile(filepath.Join(rootDir, "build", "android", "app", "build.gradle"),
		regexp.MustCompile(`versionName\s+"[^"]+"`),
		fmt.Sprintf(`versionName "%s"`, version))

	// 7. build/darwin/Info.plist & Info.dev.plist
	for _, plist := range []string{"Info.plist", "Info.dev.plist"} {
		plistPath := filepath.Join(rootDir, "build", "darwin", plist)
		replaceInFile(plistPath,
			regexp.MustCompile(`(<key>CFBundleShortVersionString</key>\s*<string>)[^<]+(</string>)`),
			fmt.Sprintf(`${1}%s${2}`, version))
		replaceInFile(plistPath,
			regexp.MustCompile(`(<key>CFBundleVersion</key>\s*<string>)[^<]+(</string>)`),
			fmt.Sprintf(`${1}%s${2}`, version))
	}

	// 8. iOS Plists
	for _, plist := range []string{
		filepath.Join("build", "ios", "Info.plist"),
		filepath.Join("build", "ios", "Info.dev.plist"),
		filepath.Join("build", "ios", "xcode-support", "Info.plist"),
	} {
		plistPath := filepath.Join(rootDir, plist)
		replaceInFile(plistPath,
			regexp.MustCompile(`(<key>CFBundleShortVersionString</key>\s*<string>)[^<]+(</string>)`),
			fmt.Sprintf(`${1}%s${2}`, version))
		replaceInFile(plistPath,
			regexp.MustCompile(`(<key>CFBundleVersion</key>\s*<string>)[^<]+(</string>)`),
			fmt.Sprintf(`${1}%d${2}`, versionCode))
	}

	// 9. build/linux/nfpm/nfpm.yaml
	replaceInFile(filepath.Join(rootDir, "build", "linux", "nfpm", "nfpm.yaml"),
		regexp.MustCompile(`(?m)^version:\s*"[^"]+"`),
		fmt.Sprintf(`version: "%s"`, version))
}

func findRootDir() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "Taskfile.yml")); err == nil {
			if _, err := os.Stat(filepath.Join(dir, "internal", "app", "config.go")); err == nil {
				return dir, nil
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("could not find project root containing Taskfile.yml and internal/app/config.go")
}

func calculateVersionCode(version string) int {
	core := strings.Split(version, "-")[0]
	parts := strings.Split(core, ".")
	major, minor, patch := 0, 0, 0
	if len(parts) > 0 {
		major, _ = strconv.Atoi(parts[0])
	}
	if len(parts) > 1 {
		minor, _ = strconv.Atoi(parts[1])
	}
	if len(parts) > 2 {
		patch, _ = strconv.Atoi(parts[2])
	}
	return major*10000 + minor*100 + patch
}

func replaceInFile(path string, re *regexp.Regexp, repl string) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return
		}
		fmt.Fprintf(os.Stderr, "Warning: failed to read %s: %v\n", path, err)
		return
	}
	content := string(data)
	if !re.MatchString(content) {
		return
	}
	updated := re.ReplaceAllString(content, repl)
	if updated != content {
		if err := os.WriteFile(path, []byte(updated), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to write %s: %v\n", path, err)
		}
	}
}
