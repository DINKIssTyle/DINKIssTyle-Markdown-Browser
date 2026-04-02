/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// RecentFile represents a recently opened file
type RecentFile struct {
	Path string `json:"path"`
	Name string `json:"name"`
}

// FileResult represents the result of opening a file
type FileResult struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// AppSettings represents the application settings
type AppSettings struct {
	Theme    string `json:"theme"`
	FontSize int    `json:"fontSize"`
	Engine   string `json:"engine"`
}

// App struct
type App struct {
	ctx              context.Context
	settingsPath     string
	recentPath       string
	mu               sync.Mutex
	frontendReady    bool
	pendingOpenFiles []string
}

// NewApp creates a new App application struct
func NewApp() *App {
	configDir, _ := os.UserConfigDir()
	appDir := filepath.Join(configDir, "dkst-markdown-browser")
	os.MkdirAll(appDir, 0755)

	return &App{
		settingsPath: filepath.Join(appDir, "settings.json"),
		recentPath:   filepath.Join(appDir, "recent.json"),
	}
}

// startup is called when the app starts. The context is saved
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.queueOpenRequests(os.Args[1:], "")
}

// FrontendReady marks the UI as ready to receive open-file events and returns queued paths.
func (a *App) FrontendReady() []string {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.frontendReady = true
	paths := append([]string(nil), a.pendingOpenFiles...)
	a.pendingOpenFiles = nil
	return paths
}

// OpenFile opens a file dialog and returns the file path and content
func (a *App) OpenFile() (FileResult, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open Markdown File",
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown Files (*.md;*.markdown)", Pattern: "*.md;*.markdown"},
		},
	})
	if err != nil || selection == "" {
		return FileResult{}, err
	}

	content, err := a.ReadFile(selection)
	if err != nil {
		return FileResult{}, err
	}

	a.saveRecentFile(selection)
	return FileResult{Path: selection, Content: content}, nil
}

// ReadFile reads the content of a file
func (a *App) ReadFile(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// ReadImageAsDataURL reads a local image file and returns a data URL for stable rendering.
func (a *App) ReadImageAsDataURL(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	mimeType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mimeType, encoded), nil
}

// SearchMarkdown searches for a query in all .md files in the directory recursively
func (a *App) SearchMarkdown(dir string, query string) ([]map[string]string, error) {
	var results []map[string]string
	query = strings.ToLower(query)

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && isMarkdownPath(path) {
			content, err := os.ReadFile(path)
			if err != nil {
				return nil // Skip files that can't be read
			}

			if strings.Contains(strings.ToLower(string(content)), query) {
				results = append(results, map[string]string{
					"path": path,
					"name": filepath.Base(path),
				})
			}
		}
		return nil
	})

	return results, err
}

// GetRecentFiles returns the list of recently opened files
func (a *App) GetRecentFiles() []RecentFile {
	var recent []RecentFile
	data, err := os.ReadFile(a.recentPath)
	if err != nil {
		return []RecentFile{}
	}

	json.Unmarshal(data, &recent)
	return recent
}

func (a *App) saveRecentFile(path string) {
	recent := a.GetRecentFiles()

	// Check if already exists
	newRecent := []RecentFile{{Path: path, Name: filepath.Base(path)}}
	for _, rf := range recent {
		if rf.Path != path {
			newRecent = append(newRecent, rf)
		}
	}

	// Limit to 8
	if len(newRecent) > 8 {
		newRecent = newRecent[:8]
	}

	data, _ := json.Marshal(newRecent)
	os.WriteFile(a.recentPath, data, 0644)
}

// ClearRecentFiles clears the list of recently opened files
func (a *App) ClearRecentFiles() {
	os.WriteFile(a.recentPath, []byte("[]"), 0644)
}

// GetSettings loads the application settings
func (a *App) GetSettings() AppSettings {
	var settings AppSettings
	// Default settings
	settings.Theme = "dark"
	settings.FontSize = 16
	settings.Engine = "marked"

	data, err := os.ReadFile(a.settingsPath)
	if err == nil {
		json.Unmarshal(data, &settings)
	}
	return settings
}

// SaveSettings saves the application settings
func (a *App) SaveSettings(settings AppSettings) {
	data, _ := json.Marshal(settings)
	os.WriteFile(a.settingsPath, data, 0644)
}

// GetSystemTheme returns the current theme (light/dark)
func (a *App) GetSystemTheme() string {
	// This is a placeholder, Wails usually provides theme info via runtime
	// or we can just default to dark for premium look.
	return "dark"
}

// OpenDirectory opens a directory dialog
func (a *App) OpenDirectory() (string, error) {
	selection, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Folder for Search",
	})
	return selection, err
}

// ConfirmOpenExternalURL shows a native confirmation dialog before opening an external URL.
func (a *App) ConfirmOpenExternalURL(url string) (bool, error) {
	log.Printf("external-url: confirm requested url=%s", url)
	response, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "External Link",
		Message:       fmt.Sprintf("Open in your system browser?\n\n%s", url),
		Buttons:       []string{"Cancel", "Open"},
		DefaultButton: "Open",
		CancelButton:  "Cancel",
	})
	if err != nil {
		log.Printf("external-url: confirm failed url=%s err=%v", url, err)
		return false, err
	}

	ok := response == "Open"
	log.Printf("external-url: confirm response url=%s response=%s ok=%v", url, response, ok)
	return ok, nil
}

// HandleFileDrop handles a file dropped onto the window
func (a *App) HandleFileDrop(path string) (FileResult, error) {
	if !isMarkdownPath(path) {
		return FileResult{}, fmt.Errorf("not a markdown file")
	}

	content, err := a.ReadFile(path)
	if err != nil {
		return FileResult{}, err
	}

	a.saveRecentFile(path)
	return FileResult{Path: path, Content: content}, nil
}

func (a *App) HandleSystemOpenFile(path string) {
	a.queueOpenRequests([]string{path}, "")
}

func (a *App) HandleSecondInstanceLaunch(data options.SecondInstanceData) {
	log.Printf("second-instance: cwd=%s args=%v", data.WorkingDirectory, data.Args)
	a.queueOpenRequests(data.Args, data.WorkingDirectory)
	if a.ctx != nil {
		runtime.WindowUnminimise(a.ctx)
		runtime.Show(a.ctx)
	}
}

func (a *App) queueOpenRequests(args []string, workingDir string) {
	for _, arg := range args {
		resolvedPath, ok := normalizeMarkdownPath(arg, workingDir)
		if !ok {
			continue
		}

		a.mu.Lock()
		ready := a.frontendReady
		if !ready && !containsPath(a.pendingOpenFiles, resolvedPath) {
			a.pendingOpenFiles = append(a.pendingOpenFiles, resolvedPath)
		}
		a.mu.Unlock()

		log.Printf("system-open-file: queued path=%s ready=%v", resolvedPath, ready)
		if ready && a.ctx != nil {
			runtime.EventsEmit(a.ctx, "system:open-file", resolvedPath)
		}
	}
}

func isMarkdownPath(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".md" || ext == ".markdown"
}

func normalizeMarkdownPath(path string, workingDir string) (string, bool) {
	if !isMarkdownPath(path) {
		return "", false
	}

	if !filepath.IsAbs(path) && workingDir != "" {
		path = filepath.Join(workingDir, path)
	}

	return filepath.Clean(path), true
}

func containsPath(paths []string, target string) bool {
	for _, path := range paths {
		if path == target {
			return true
		}
	}
	return false
}

// OpenExternalURL opens a URL in the system browser with an OS-level fallback path.
func (a *App) OpenExternalURL(url string) error {
	log.Printf("external-url: requested url=%s os=%s", url, goruntime.GOOS)
	switch goruntime.GOOS {
	case "darwin":
		err := exec.Command("open", url).Start()
		if err != nil {
			log.Printf("external-url: failed url=%s err=%v", url, err)
			return err
		}
		log.Printf("external-url: launched url=%s", url)
		return nil
	case "windows":
		err := exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
		if err != nil {
			log.Printf("external-url: failed url=%s err=%v", url, err)
			return err
		}
		log.Printf("external-url: launched url=%s", url)
		return nil
	default:
		err := exec.Command("xdg-open", url).Start()
		if err != nil {
			log.Printf("external-url: failed url=%s err=%v", url, err)
			return err
		}
		log.Printf("external-url: launched url=%s", url)
		return nil
	}
}

// OpenExternalPath opens a local file or directory in the system shell.
func (a *App) OpenExternalPath(path string) error {
	log.Printf("external-path: requested path=%s os=%s", path, goruntime.GOOS)
	switch goruntime.GOOS {
	case "darwin":
		err := exec.Command("open", path).Start()
		if err != nil {
			log.Printf("external-path: failed path=%s err=%v", path, err)
			return err
		}
		log.Printf("external-path: launched path=%s", path)
		return nil
	case "windows":
		err := exec.Command("explorer", path).Start()
		if err != nil {
			log.Printf("external-path: failed path=%s err=%v", path, err)
			return err
		}
		log.Printf("external-path: launched path=%s", path)
		return nil
	default:
		err := exec.Command("xdg-open", path).Start()
		if err != nil {
			log.Printf("external-path: failed path=%s err=%v", path, err)
			return err
		}
		log.Printf("external-path: launched path=%s", path)
		return nil
	}
}
