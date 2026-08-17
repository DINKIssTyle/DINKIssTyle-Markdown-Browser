// Command strip_wails_location creates a machine-local Wails module replacement
// with the unused iOS geolocation bridge removed. The original module cache is
// never changed, and a new Wails version automatically regenerates the copy.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

const (
	wailsModule  = "github.com/wailsapp/wails/v3"
	patchVersion = "3"
)

func main() {
	modfilePath := flag.String("modfile", "build/ios/xcode/gen/wails-no-location.mod", "generated Go modfile")
	moduleOut := flag.String("module-out", "build/ios/xcode/gen/wails-no-location-module", "patched Wails module directory")
	flag.Parse()

	moduleDir := strings.TrimSpace(run("go", "list", "-m", "-f", "{{.Dir}}", wailsModule))
	if moduleDir == "" {
		fatalf("resolve %s: module directory is empty", wailsModule)
	}
	absoluteModuleOut := mustAbs(*moduleOut)
	prepareModule(moduleDir, absoluteModuleOut)
	writeModfile(*modfilePath, absoluteModuleOut)

	fmt.Println("Disabled the unused Wails iOS geolocation bridge in a local module replacement.")
}

func prepareModule(sourceDir, outputDir string) {
	stampPath := filepath.Join(outputDir, ".location-patch-source")
	expectedStamp := sourceDir + "\n" + patchVersion + "\n"
	if stamp, err := os.ReadFile(stampPath); err == nil && string(stamp) == expectedStamp {
		return
	}

	if err := os.RemoveAll(outputDir); err != nil {
		fatalf("clear patched Wails module: %v", err)
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		fatalf("create patched Wails module: %v", err)
	}

	for _, name := range []string{"go.mod", "go.sum"} {
		source := filepath.Join(sourceDir, name)
		if _, err := os.Stat(source); err == nil {
			copyFile(source, filepath.Join(outputDir, name))
		}
	}
	for _, name := range []string{"internal", "pkg"} {
		copyTree(filepath.Join(sourceDir, name), filepath.Join(outputDir, name))
	}

	applicationDir := filepath.Join(outputDir, "pkg", "application")
	patchFile(filepath.Join(applicationDir, "mobile_features_ios.go"), patchGo)
	patchFile(filepath.Join(applicationDir, "mobile_features_ios.h"), patchHeader)
	patchFile(filepath.Join(applicationDir, "mobile_features_ios.m"), patchObjectiveC)
	assertTreeLocationFree(applicationDir)

	if err := os.WriteFile(stampPath, []byte(expectedStamp), 0o644); err != nil {
		fatalf("write patched-module stamp: %v", err)
	}
}

func writeModfile(path, moduleDir string) {
	projectMod, err := os.ReadFile("go.mod")
	if err != nil {
		fatalf("read project go.mod: %v", err)
	}
	replaceLine := "replace " + wailsModule + " => " + strconv.Quote(filepath.ToSlash(moduleDir))
	if regexp.MustCompile(`(?m)^replace\s+` + regexp.QuoteMeta(wailsModule) + `\s+=>`).Match(projectMod) {
		fatalf("project go.mod already replaces %s; update the iOS location patch strategy", wailsModule)
	}
	contents := append([]byte{}, projectMod...)
	contents = append(contents, []byte("\n"+replaceLine+"\n")...)

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		fatalf("create modfile directory: %v", err)
	}
	if err := os.WriteFile(path, contents, 0o644); err != nil {
		fatalf("write generated modfile: %v", err)
	}
	if sum, err := os.ReadFile("go.sum"); err == nil {
		sumPath := strings.TrimSuffix(path, filepath.Ext(path)) + ".sum"
		if err := os.WriteFile(sumPath, sum, 0o644); err != nil {
			fatalf("write generated go.sum: %v", err)
		}
	}
}

func patchFile(path string, transform func(string) string) {
	data, err := os.ReadFile(path)
	if err != nil {
		fatalf("read Wails source %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(transform(string(data))), 0o644); err != nil {
		fatalf("write patched Wails source %s: %v", path, err)
	}
}

func patchGo(source string) string {
	if !strings.Contains(source, "ios_get_location") && !strings.Contains(source, "-framework CoreLocation") {
		return source
	}
	if strings.Count(source, " -framework CoreLocation") != 1 {
		fatalf("Wails mobile_features_ios.go changed: expected one CoreLocation linker flag")
	}
	source = strings.Replace(source, " -framework CoreLocation", "", 1)

	method := regexp.MustCompile(`(?s)// GetLocation requests.*?\nfunc \(iosManager\) GetLocation\(\) \{ C\.ios_get_location\(\) \}`)
	if len(method.FindAllStringIndex(source, -1)) != 1 {
		fatalf("Wails mobile_features_ios.go changed: GetLocation bridge was not uniquely identified")
	}
	source = method.ReplaceAllString(source, "// GetLocation is intentionally unavailable in this app because it does not use location data.\nfunc (iosManager) GetLocation() {}")
	assertLocationFree("mobile_features_ios.go", source)
	return source
}

func patchHeader(source string) string {
	if !strings.Contains(source, "ios_get_location") {
		return source
	}
	declaration := regexp.MustCompile(`(?m)^void ios_get_location\(void\);[^\n]*\n`)
	if len(declaration.FindAllStringIndex(source, -1)) != 1 {
		fatalf("Wails mobile_features_ios.h changed: location declaration was not uniquely identified")
	}
	source = declaration.ReplaceAllString(source, "")
	assertLocationFree("mobile_features_ios.h", source)
	return source
}

func patchObjectiveC(source string) string {
	if !strings.Contains(source, "CoreLocation") && !strings.Contains(source, "ios_get_location") {
		return source
	}
	if strings.Count(source, "#import <CoreLocation/CoreLocation.h>\n") != 1 {
		fatalf("Wails mobile_features_ios.m changed: expected one CoreLocation import")
	}
	source = strings.Replace(source, "#import <CoreLocation/CoreLocation.h>\n", "", 1)

	section := regexp.MustCompile(`(?s)// MARK: - Geolocation\n.*?(// MARK: - Accelerometer / device motion)`)
	if len(section.FindAllStringIndex(source, -1)) != 1 {
		fatalf("Wails mobile_features_ios.m changed: geolocation section was not uniquely identified")
	}
	source = section.ReplaceAllString(source, "$1")
	assertLocationFree("mobile_features_ios.m", source)
	return source
}

func assertLocationFree(name, source string) {
	for _, forbidden := range []string{"CoreLocation", "CLLocation", "ios_get_location", "requestWhenInUseAuthorization"} {
		if strings.Contains(source, forbidden) {
			fatalf("patched %s still contains %q", name, forbidden)
		}
	}
}

func assertTreeLocationFree(root string) {
	err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() || !info.Mode().IsRegular() {
			return nil
		}
		switch filepath.Ext(path) {
		case ".c", ".go", ".h", ".m", ".mm":
		default:
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, forbidden := range []string{"CoreLocation", "CLLocation", "ios_get_location", "requestWhenInUseAuthorization"} {
			if strings.Contains(string(data), forbidden) {
				return fmt.Errorf("%s still contains location API marker %q", path, forbidden)
			}
		}
		return nil
	})
	if err != nil {
		fatalf("verify patched Wails application sources: %v", err)
	}
}

func copyTree(source, destination string) {
	err := filepath.Walk(source, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if info.Mode().IsRegular() {
			copyFile(path, target)
		}
		return nil
	})
	if err != nil {
		fatalf("copy Wails module tree %s: %v", source, err)
	}
}

func copyFile(source, destination string) {
	input, err := os.Open(source)
	if err != nil {
		fatalf("open %s: %v", source, err)
	}
	defer input.Close()
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		fatalf("create directory for %s: %v", destination, err)
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		fatalf("create %s: %v", destination, err)
	}
	if _, err := io.Copy(output, input); err != nil {
		output.Close()
		fatalf("copy %s: %v", source, err)
	}
	if err := output.Close(); err != nil {
		fatalf("close %s: %v", destination, err)
	}
}

func mustAbs(path string) string {
	absolute, err := filepath.Abs(path)
	if err != nil {
		fatalf("resolve %s: %v", path, err)
	}
	return absolute
}

func run(name string, args ...string) string {
	command := exec.Command(name, args...)
	output, err := command.CombinedOutput()
	if err != nil {
		fatalf("run %s: %v\n%s", name, err, output)
	}
	return string(output)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "error: "+format+"\n", args...)
	os.Exit(1)
}
