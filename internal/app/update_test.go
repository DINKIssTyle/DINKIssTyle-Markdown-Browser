package app

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestDefaultMainToolbarVisibility(t *testing.T) {
	app := &App{settingsPath: t.TempDir() + "/settings.json"}
	settings := app.getSettingsUnlocked()

	if settings.MainToolbarTheme {
		t.Fatal("theme toolbar button should be hidden by default")
	}
	if !settings.MainToolbarNewDocument || !settings.MainToolbarEdit ||
		!settings.MainToolbarTranslate || !settings.MainToolbarFontSize {
		t.Fatal("changing the theme default should not hide the other toolbar buttons")
	}
}

func TestWindowStateRestoreEnabledByDefault(t *testing.T) {
	app := &App{settingsPath: t.TempDir() + "/settings.json"}
	if !app.getSettingsUnlocked().RestoreWindowState {
		t.Fatal("window size and position restore should be enabled by default")
	}
}

func TestDisablingWindowStateRestoreRemovesSavedState(t *testing.T) {
	tempDir := t.TempDir()
	windowStatePath := filepath.Join(tempDir, "window-state.json")
	if err := os.WriteFile(windowStatePath, []byte(`{"width":1200,"height":800}`), 0600); err != nil {
		t.Fatal(err)
	}
	app := &App{
		settingsPath:    filepath.Join(tempDir, "settings.json"),
		windowStatePath: windowStatePath,
	}
	app.saveSettingsUnlocked(AppSettings{RestoreWindowState: false})
	if _, err := os.Stat(windowStatePath); !os.IsNotExist(err) {
		t.Fatalf("window state file still exists after disabling restore: %v", err)
	}
}

func testScreen(x, y, width, height int, primary bool) *application.Screen {
	return &application.Screen{
		WorkArea:  application.Rect{X: x, Y: y, Width: width, Height: height},
		IsPrimary: primary,
	}
}

func TestClampWindowBoundsPreservesVisibleBounds(t *testing.T) {
	want := application.Rect{X: 120, Y: 90, Width: 1200, Height: 800}
	got, ok := clampWindowBounds(want, []*application.Screen{testScreen(0, 0, 1920, 1040, true)}, 800, 600)
	if !ok || got != want {
		t.Fatalf("clampWindowBounds() = (%+v, %v), want (%+v, true)", got, ok, want)
	}
}

func TestClampWindowBoundsReturnsOffscreenWindowToPrimaryDisplay(t *testing.T) {
	got, ok := clampWindowBounds(
		application.Rect{X: 4200, Y: 200, Width: 1200, Height: 800},
		[]*application.Screen{
			testScreen(1920, 0, 1920, 1040, false),
			testScreen(0, 0, 1920, 1040, true),
		},
		800,
		600,
	)
	want := application.Rect{X: 720, Y: 200, Width: 1200, Height: 800}
	if !ok || got != want {
		t.Fatalf("clampWindowBounds() = (%+v, %v), want (%+v, true)", got, ok, want)
	}
}

func TestClampWindowBoundsUsesIntersectingSecondaryDisplay(t *testing.T) {
	want := application.Rect{X: -1700, Y: 100, Width: 1000, Height: 700}
	got, ok := clampWindowBounds(want, []*application.Screen{
		testScreen(0, 0, 1920, 1040, true),
		testScreen(-1920, 0, 1920, 1040, false),
	}, 800, 600)
	if !ok || got != want {
		t.Fatalf("clampWindowBounds() = (%+v, %v), want (%+v, true)", got, ok, want)
	}
}

func TestClampWindowBoundsFitsOversizedWindowToWorkArea(t *testing.T) {
	got, ok := clampWindowBounds(
		application.Rect{X: -100, Y: -100, Width: 2400, Height: 1600},
		[]*application.Screen{testScreen(0, 24, 1280, 720, true)},
		800,
		600,
	)
	want := application.Rect{X: 0, Y: 24, Width: 1280, Height: 720}
	if !ok || got != want {
		t.Fatalf("clampWindowBounds() = (%+v, %v), want (%+v, true)", got, ok, want)
	}
}

func TestClampWindowBoundsRejectsInvalidSavedSize(t *testing.T) {
	if got, ok := clampWindowBounds(application.Rect{X: 20, Y: 20}, []*application.Screen{testScreen(0, 0, 1920, 1040, true)}, 800, 600); ok {
		t.Fatalf("clampWindowBounds() = (%+v, true), want invalid state", got)
	}
}

func TestDefaultLanguageCodesPreserveExistingLanguages(t *testing.T) {
	app := &App{settingsPath: t.TempDir() + "/settings.json"}
	settings := app.getSettingsUnlocked()
	want := []string{"en-US", "es-ES", "fr-FR", "de-DE", "ko-KR", "zh-CN", "zh-TW", "ja-JP"}

	if len(settings.LanguageCodes) != len(want) {
		t.Fatalf("LanguageCodes length = %d, want %d", len(settings.LanguageCodes), len(want))
	}
	for index, code := range want {
		if settings.LanguageCodes[index] != code {
			t.Fatalf("LanguageCodes[%d] = %q, want %q", index, settings.LanguageCodes[index], code)
		}
	}
}

func TestNormalizeSettingsLanguageCodes(t *testing.T) {
	settings := AppSettings{LanguageCodes: []string{
		" ko-KR ", "en-US", "ko-KR", "fr-FR", "de-DE", "es-ES", "ja-JP",
		"zh-CN", "zh-TW", "it-IT", "pt-BR", "uk-UA",
	}}
	normalizeSettings(&settings)

	want := []string{"ko-KR", "en-US", "fr-FR", "de-DE", "es-ES", "ja-JP", "zh-CN", "zh-TW", "it-IT", "pt-BR"}
	if len(settings.LanguageCodes) != len(want) {
		t.Fatalf("LanguageCodes length = %d, want %d", len(settings.LanguageCodes), len(want))
	}
	for index, code := range want {
		if settings.LanguageCodes[index] != code {
			t.Fatalf("LanguageCodes[%d] = %q, want %q", index, settings.LanguageCodes[index], code)
		}
	}
}

func TestNormalizeSettingsScrollbarVisibility(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  string
	}{
		{name: "always", value: "always", want: "always"},
		{name: "when scrolling", value: "when-scrolling", want: "when-scrolling"},
		{name: "missing defaults to always", value: "", want: "always"},
		{name: "invalid defaults to always", value: "sometimes", want: "always"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			settings := AppSettings{ScrollbarVisibility: test.value}
			normalizeSettings(&settings)
			if settings.ScrollbarVisibility != test.want {
				t.Fatalf("ScrollbarVisibility = %q, want %q", settings.ScrollbarVisibility, test.want)
			}
		})
	}
}

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		left  string
		right string
		want  int
	}{
		{left: "v2.2.3", right: "2.2.2", want: 1},
		{left: "v2.2.2", right: "2.2.2", want: 0},
		{left: "2.2.1", right: "v2.2.2", want: -1},
		{left: "v2.2.0", right: "2.2.0-beta.11", want: 1},
		{left: "2.1.0-beta11", right: "2.1.0-beta10", want: 1},
		{left: "v2.0b10", right: "v2.0b9", want: 1},
	}

	for _, test := range tests {
		t.Run(test.left+"_vs_"+test.right, func(t *testing.T) {
			got, err := compareVersions(test.left, test.right)
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("compareVersions(%q, %q) = %d, want %d", test.left, test.right, got, test.want)
			}
		})
	}
}

func TestSelectReleaseAsset(t *testing.T) {
	assets := []githubReleaseAsset{
		{Name: "DKST-Markdown-Browser-Linux-AMD64.7z", State: "uploaded", BrowserDownloadURL: trustedDownloadURL("linux.7z")},
		{Name: "DKST-Markdown-Browser-Windows-AMD64.7z", State: "uploaded", BrowserDownloadURL: trustedDownloadURL("windows.7z")},
		{Name: "DKST_Markdown_Browser_macOS_Universal2_Signed.dmg", State: "uploaded", BrowserDownloadURL: trustedDownloadURL("mac.dmg")},
	}

	tests := []struct {
		goos string
		want string
	}{
		{goos: "darwin", want: "DKST_Markdown_Browser_macOS_Universal2_Signed.dmg"},
		{goos: "windows", want: "DKST-Markdown-Browser-Windows-AMD64.7z"},
		{goos: "linux", want: "DKST-Markdown-Browser-Linux-AMD64.7z"},
	}
	for _, test := range tests {
		t.Run(test.goos, func(t *testing.T) {
			asset, ok := selectReleaseAsset(assets, test.goos, "amd64")
			if !ok || asset.Name != test.want {
				t.Fatalf("selectReleaseAsset() = %q, %v, want %q", asset.Name, ok, test.want)
			}
		})
	}
}

func TestSelectReleaseAssetRejectsWrongArchitectureAndHost(t *testing.T) {
	assets := []githubReleaseAsset{
		{Name: "App-Linux-AMD64.7z", State: "uploaded", BrowserDownloadURL: trustedDownloadURL("amd64.7z")},
		{Name: "App-Linux-ARM64.7z", State: "uploaded", BrowserDownloadURL: "https://example.com/arm64.7z"},
	}
	if _, ok := selectReleaseAsset(assets, "linux", "arm64"); ok {
		t.Fatal("selectReleaseAsset() accepted an asset for the wrong architecture or host")
	}
}

func TestCheckForUpdateParsesRelease(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Header.Get("Accept") != "application/vnd.github+json" {
			t.Errorf("unexpected Accept header %q", request.Header.Get("Accept"))
		}
		body := `{
            "tag_name":"v2.2.3",
            "name":"2.2.3",
            "body":"## Changes\n- Fixed a bug",
            "html_url":"https://github.com/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases/tag/v2.2.3",
            "published_at":"2026-08-02T00:00:00Z",
            "assets":[{
                "name":"DKST-Markdown-Browser-Windows-AMD64.7z",
                "browser_download_url":"https://github.com/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases/download/v2.2.3/windows.7z",
                "state":"uploaded",
                "size":1234,
                "digest":"sha256:abc"
            }]
		}`
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    request,
		}, nil
	})}

	checkedAt := time.Date(2026, time.August, 2, 12, 0, 0, 0, time.FixedZone("KST", 9*60*60))
	info, err := checkForUpdate(context.Background(), client, "https://api.github.test/latest", "2.2.2", "windows", "amd64", checkedAt)
	if err != nil {
		t.Fatal(err)
	}
	if !info.Available || info.LatestVersion != "2.2.3" || info.Asset == nil {
		t.Fatalf("unexpected update info: %#v", info)
	}
	if info.CheckedAt != "2026-08-02T03:00:00Z" {
		t.Fatalf("CheckedAt = %q", info.CheckedAt)
	}
}

func trustedDownloadURL(filename string) string {
	return "https://github.com/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases/download/v9.9.9/" + filename
}
