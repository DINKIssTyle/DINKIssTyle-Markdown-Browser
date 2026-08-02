package app

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
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
