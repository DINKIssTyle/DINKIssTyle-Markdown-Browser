package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	updateCheckIntervalNever   = "never"
	updateCheckIntervalDaily   = "daily"
	updateCheckIntervalWeekly  = "weekly"
	updateCheckIntervalMonthly = "monthly"

	latestReleaseAPIURL = "https://api.github.com/repos/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases/latest"
	githubReleaseHost   = "github.com"
	githubReleasePrefix = "/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases/"
)

var (
	updateHTTPClient = &http.Client{Timeout: 10 * time.Second}
	legacyBetaTag    = regexp.MustCompile(`^(\d+)\.(\d+)b(\d+)$`)
	joinedBetaTag    = regexp.MustCompile(`^beta(\d+)$`)
)

type UpdateAsset struct {
	Name        string `json:"name"`
	DownloadURL string `json:"downloadUrl"`
	Size        int64  `json:"size"`
	Digest      string `json:"digest"`
}

type UpdateInfo struct {
	Available       bool         `json:"available"`
	CurrentVersion  string       `json:"currentVersion"`
	LatestVersion   string       `json:"latestVersion"`
	ReleaseName     string       `json:"releaseName"`
	ReleaseNotes    string       `json:"releaseNotes"`
	ReleaseURL      string       `json:"releaseUrl"`
	PublishedAt     string       `json:"publishedAt"`
	CheckedAt       string       `json:"checkedAt"`
	OperatingSystem string       `json:"operatingSystem"`
	Architecture    string       `json:"architecture"`
	Asset           *UpdateAsset `json:"asset,omitempty"`
}

type githubRelease struct {
	TagName     string               `json:"tag_name"`
	Name        string               `json:"name"`
	Body        string               `json:"body"`
	HTMLURL     string               `json:"html_url"`
	Draft       bool                 `json:"draft"`
	Prerelease  bool                 `json:"prerelease"`
	PublishedAt string               `json:"published_at"`
	Assets      []githubReleaseAsset `json:"assets"`
}

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	State              string `json:"state"`
	Size               int64  `json:"size"`
	Digest             string `json:"digest"`
}

type parsedVersion struct {
	core       [3]int
	prerelease []string
}

// CheckForUpdate fetches the latest public GitHub release and selects the best
// download for the current operating system and architecture. It only reports
// an available download; installing or replacing the running app is left to the user.
func (a *App) CheckForUpdate() (UpdateInfo, error) {
	ctx := context.Background()
	if a.wailsApp != nil {
		ctx = a.wailsApp.Context()
	}

	info, err := checkForUpdate(ctx, updateHTTPClient, latestReleaseAPIURL, AppVersion, runtime.GOOS, runtime.GOARCH, time.Now())
	if err != nil {
		return UpdateInfo{}, err
	}

	a.settingsMu.Lock()
	settings := a.getSettingsUnlocked()
	settings.LastUpdateCheck = info.CheckedAt
	a.saveSettingsUnlocked(settings)
	a.settingsMu.Unlock()

	return info, nil
}

func checkForUpdate(ctx context.Context, client *http.Client, endpoint, currentVersion, goos, goarch string, checkedAt time.Time) (UpdateInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return UpdateInfo{}, fmt.Errorf("create update request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "DKST-Markdown-Browser/"+strings.TrimSpace(currentVersion))

	response, err := client.Do(req)
	if err != nil {
		return UpdateInfo{}, fmt.Errorf("check GitHub release: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		if response.StatusCode == http.StatusForbidden || response.StatusCode == http.StatusTooManyRequests {
			return UpdateInfo{}, errors.New("GitHub update checks are temporarily rate limited")
		}
		return UpdateInfo{}, fmt.Errorf("GitHub release request returned %s", response.Status)
	}

	var release githubRelease
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&release); err != nil {
		return UpdateInfo{}, fmt.Errorf("decode GitHub release: %w", err)
	}
	if release.Draft || release.Prerelease {
		return UpdateInfo{}, errors.New("GitHub returned a non-stable release as latest")
	}
	if strings.TrimSpace(release.TagName) == "" {
		return UpdateInfo{}, errors.New("GitHub release does not contain a version tag")
	}
	if !isTrustedGitHubReleaseURL(release.HTMLURL) {
		return UpdateInfo{}, errors.New("GitHub release contains an unexpected release URL")
	}

	comparison, err := compareVersions(release.TagName, currentVersion)
	if err != nil {
		return UpdateInfo{}, fmt.Errorf("compare update versions: %w", err)
	}

	info := UpdateInfo{
		Available:       comparison > 0,
		CurrentVersion:  normalizeVersionLabel(currentVersion),
		LatestVersion:   normalizeVersionLabel(release.TagName),
		ReleaseName:     strings.TrimSpace(release.Name),
		ReleaseNotes:    release.Body,
		ReleaseURL:      release.HTMLURL,
		PublishedAt:     release.PublishedAt,
		CheckedAt:       checkedAt.UTC().Format(time.RFC3339),
		OperatingSystem: goos,
		Architecture:    goarch,
	}
	if asset, ok := selectReleaseAsset(release.Assets, goos, goarch); ok {
		info.Asset = &UpdateAsset{
			Name:        asset.Name,
			DownloadURL: asset.BrowserDownloadURL,
			Size:        asset.Size,
			Digest:      asset.Digest,
		}
	}
	return info, nil
}

func normalizeVersionLabel(version string) string {
	return strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(version), "v"), "V")
}

func compareVersions(left, right string) (int, error) {
	leftVersion, err := parseVersion(left)
	if err != nil {
		return 0, fmt.Errorf("invalid version %q", left)
	}
	rightVersion, err := parseVersion(right)
	if err != nil {
		return 0, fmt.Errorf("invalid version %q", right)
	}

	for index := range leftVersion.core {
		if leftVersion.core[index] > rightVersion.core[index] {
			return 1, nil
		}
		if leftVersion.core[index] < rightVersion.core[index] {
			return -1, nil
		}
	}

	return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease), nil
}

func parseVersion(value string) (parsedVersion, error) {
	normalized := normalizeVersionLabel(value)
	if buildIndex := strings.IndexByte(normalized, '+'); buildIndex >= 0 {
		normalized = normalized[:buildIndex]
	}
	if match := legacyBetaTag.FindStringSubmatch(normalized); match != nil {
		normalized = fmt.Sprintf("%s.%s.0-beta.%s", match[1], match[2], match[3])
	}

	corePart, prereleasePart, _ := strings.Cut(normalized, "-")
	if match := joinedBetaTag.FindStringSubmatch(strings.ToLower(prereleasePart)); match != nil {
		prereleasePart = "beta." + match[1]
	}
	coreParts := strings.Split(corePart, ".")
	if len(coreParts) < 2 || len(coreParts) > 3 {
		return parsedVersion{}, errors.New("version core must contain two or three numbers")
	}

	var version parsedVersion
	for index, part := range coreParts {
		if part == "" {
			return parsedVersion{}, errors.New("version contains an empty number")
		}
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return parsedVersion{}, errors.New("version contains a non-numeric core")
		}
		version.core[index] = number
	}
	if prereleasePart != "" {
		version.prerelease = strings.Split(prereleasePart, ".")
	}
	return version, nil
}

func comparePrerelease(left, right []string) int {
	if len(left) == 0 && len(right) == 0 {
		return 0
	}
	if len(left) == 0 {
		return 1
	}
	if len(right) == 0 {
		return -1
	}

	maxLength := len(left)
	if len(right) > maxLength {
		maxLength = len(right)
	}
	for index := 0; index < maxLength; index++ {
		if index >= len(left) {
			return -1
		}
		if index >= len(right) {
			return 1
		}
		comparison := compareVersionIdentifier(left[index], right[index])
		if comparison != 0 {
			return comparison
		}
	}
	return 0
}

func compareVersionIdentifier(left, right string) int {
	left = strings.ToLower(left)
	right = strings.ToLower(right)
	if left == right {
		return 0
	}
	leftNumber, leftNumeric := numericIdentifier(left)
	rightNumber, rightNumeric := numericIdentifier(right)
	if leftNumeric && rightNumeric {
		if leftNumber > rightNumber {
			return 1
		}
		return -1
	}
	if leftNumeric {
		return -1
	}
	if rightNumeric {
		return 1
	}
	if left > right {
		return 1
	}
	return -1
}

func numericIdentifier(value string) (int, bool) {
	number, err := strconv.Atoi(value)
	return number, err == nil
}

func selectReleaseAsset(assets []githubReleaseAsset, goos, goarch string) (githubReleaseAsset, bool) {
	bestScore := -1
	var best githubReleaseAsset
	for _, asset := range assets {
		if asset.State != "" && asset.State != "uploaded" {
			continue
		}
		if !isTrustedGitHubDownloadURL(asset.BrowserDownloadURL) {
			continue
		}
		score := releaseAssetScore(asset.Name, goos, goarch)
		if score > bestScore {
			bestScore = score
			best = asset
		}
	}
	return best, bestScore >= 0
}

func releaseAssetScore(name, goos, goarch string) int {
	lowerName := strings.ToLower(name)
	extension := strings.ToLower(path.Ext(lowerName))
	score := -1

	switch goos {
	case "darwin":
		if extension == ".dmg" {
			score = 130
		} else if strings.Contains(lowerName, "macos") || strings.Contains(lowerName, "darwin") {
			score = 90
		}
	case "windows":
		if strings.Contains(lowerName, "windows") {
			score = 120
		} else if extension == ".exe" || extension == ".msi" {
			score = 90
		}
	case "linux":
		if strings.Contains(lowerName, "linux") {
			score = 120
		} else if extension == ".appimage" || extension == ".deb" || extension == ".rpm" {
			score = 90
		}
	default:
		return -1
	}
	if score < 0 {
		return -1
	}

	if strings.Contains(lowerName, "universal") {
		score += 30
	} else if assetMatchesArchitecture(lowerName, goarch) {
		score += 20
	} else if assetNamesAnotherArchitecture(lowerName, goarch) {
		return -1
	}

	switch extension {
	case ".dmg", ".exe", ".msi", ".appimage", ".deb", ".rpm":
		score += 10
	}
	return score
}

func assetMatchesArchitecture(name, goarch string) bool {
	switch goarch {
	case "amd64":
		return strings.Contains(name, "amd64") || strings.Contains(name, "x86_64") || strings.Contains(name, "x64")
	case "arm64":
		return strings.Contains(name, "arm64") || strings.Contains(name, "aarch64")
	default:
		return strings.Contains(name, strings.ToLower(goarch))
	}
}

func assetNamesAnotherArchitecture(name, goarch string) bool {
	amd64Named := strings.Contains(name, "amd64") || strings.Contains(name, "x86_64") || strings.Contains(name, "x64")
	arm64Named := strings.Contains(name, "arm64") || strings.Contains(name, "aarch64")
	return (goarch == "amd64" && arm64Named) || (goarch == "arm64" && amd64Named)
}

func isTrustedGitHubReleaseURL(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	return err == nil && parsed.Scheme == "https" && parsed.Hostname() == githubReleaseHost && strings.HasPrefix(parsed.EscapedPath(), githubReleasePrefix)
}

func isTrustedGitHubDownloadURL(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	return err == nil && parsed.Scheme == "https" && parsed.Hostname() == githubReleaseHost && strings.HasPrefix(parsed.EscapedPath(), githubReleasePrefix+"download/")
}
