/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"net/http"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

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
	Theme             string  `json:"theme"`
	FontSize          int     `json:"fontSize"`
	Engine            string  `json:"engine"`
	AIGeneralEndpoint string  `json:"aiGeneralEndpoint"`
	AIGeneralModel    string  `json:"aiGeneralModel"`
	AIGeneralKey      string  `json:"aiGeneralKey"`
	AIGeneralTemp     float64 `json:"aiGeneralTemp"`
	AIFIMEndpoint     string  `json:"aiFimEndpoint"`
	AIFIMModel        string  `json:"aiFimModel"`
	AIFIMKey          string  `json:"aiFimKey"`
	AIFIMTemp         float64 `json:"aiFimTemp"`
	AIGeneralProvider string  `json:"aiGeneralProvider"` // "openai" or "lmstudio"
	KoreanImeEnterFix bool    `json:"koreanImeEnterFix"`
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
	appDir := filepath.Join(configDir, "DKST Markdown Browser")
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
		Title: "Open Document",
		Filters: []runtime.FileFilter{
			{DisplayName: "Document Files (*.md;*.markdown;*.html;*.htm)", Pattern: "*.md;*.markdown;*.html;*.htm"},
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

// SelectDocument opens a file dialog to select a document for insertion
func (a *App) SelectDocument() (string, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Document",
		Filters: []runtime.FileFilter{
			{DisplayName: "Document Files", Pattern: "*.md;*.markdown;*.html;*.htm"},
		},
	})
	return selection, err
}

// SelectImage opens a file dialog to select an image for insertion
func (a *App) SelectImage() (string, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Image",
		Filters: []runtime.FileFilter{
			{DisplayName: "Image Files", Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg;*.bmp;*.ico"},
		},
	})
	return selection, err
}

// ShowSaveFileDialog opens a dialog to save a new file
func (a *App) ShowSaveFileDialog(defaultName string) (string, error) {
	selection, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save File",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown Files", Pattern: "*.md;*.markdown"},
		},
	})
	return selection, err
}

// GetRelativePath calculates the relative path from base to target
func (a *App) GetRelativePath(basePath string, targetPath string) (string, error) {
	if basePath == "" {
		return targetPath, nil // No base path defined (unsaved file), use absolute
	}

	info, err := os.Stat(basePath)
	if err == nil && !info.IsDir() {
		basePath = filepath.Dir(basePath)
	} else if err != nil {
		basePath = filepath.Dir(basePath)
	}

	rel, err := filepath.Rel(basePath, targetPath)
	if err != nil {
		return "", err
	}
	return filepath.ToSlash(rel), nil
}


// ReadFile reads the content of a file
func (a *App) ReadFile(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// SaveFile saves the content to a file
func (a *App) SaveFile(path string, content string) error {
	return os.WriteFile(path, []byte(content), 0644)
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
	settings.AIGeneralProvider = "openai"
	settings.AIGeneralTemp = 0.0
	settings.AIFIMTemp = 0.0

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
	return a.AskConfirm("External Link", fmt.Sprintf("Open in your system browser?\n\n%s", url), "Open", "Cancel"), nil
}

// AskConfirm shows a native confirmation dialog with custom button labels.
func (a *App) AskConfirm(title string, message string, okText string, cancelText string) bool {
	// macOS(darwin)일 경우: 첫 번째 요소가 가장 오른쪽(기본 버튼)으로 가므로 순서를 바꿈
	// Windows/Linux: 배열 순서대로 왼쪽->오른쪽 배치
	buttons := []string{cancelText, okText}
	if goruntime.GOOS == "darwin" {
		buttons = []string{okText, cancelText}
	}

	response, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         title,
		Message:       message,
		Buttons:       buttons,
		DefaultButton: okText,
		CancelButton:  cancelText,
	})
	if err != nil {
		log.Printf("dialog: failed title=%s err=%v", title, err)
		return false
	}
	return response == okText
}

// AskSaveDiscardCancel shows a dialog with Save, Discard, and Cancel options.
func (a *App) AskSaveDiscardCancel(title string, message string) string {
	// macOS(darwin): [Save](1st, far right, default) [Cancel](2nd) [Discard](3rd)
	// Windows/Linux: [Save] [Discard] [Cancel]
	buttons := []string{"Save", "Discard", "Cancel"}
	if goruntime.GOOS == "darwin" {
		buttons = []string{"Save", "Cancel", "Discard"}
	}

	response, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         title,
		Message:       message,
		Buttons:       buttons,
		DefaultButton: "Save",
		CancelButton:  "Cancel",
	})
	if err != nil {
		return "Cancel"
	}
	return response
}

// HandleFileDrop handles a file dropped onto the window
func (a *App) HandleFileDrop(path string) (FileResult, error) {
	if !isSupportedDocumentPath(path) {
		return FileResult{}, fmt.Errorf("not a supported document file")
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
	if a.ctx != nil {
		runtime.WindowUnminimise(a.ctx)
		runtime.Show(a.ctx)
	}
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
		resolvedPath, ok := normalizeDocumentPath(arg, workingDir)
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

func isHTMLPath(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".html" || ext == ".htm"
}

func isSupportedDocumentPath(path string) bool {
	return isMarkdownPath(path) || isHTMLPath(path)
}

func normalizeDocumentPath(path string, workingDir string) (string, bool) {
	if !isSupportedDocumentPath(path) {
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

// MakeAIRequest proxies a POST request to avoid CORS issues caused by local AI servers
func (a *App) MakeAIRequest(endpoint string, headers map[string]string, body string) (string, error) {
	req, err := http.NewRequest("POST", endpoint, strings.NewReader(body))
	if err != nil {
		return "", err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return string(respBody), fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return string(respBody), nil
}
	
// MakeLMStudioRequest handles LM Studio native streaming and progress reporting
func (a *App) MakeLMStudioRequest(endpoint string, headers map[string]string, body string) (string, error) {
	// Add "store": false to the body if it's a JSON object
	var bodyMap map[string]any
	if err := json.Unmarshal([]byte(body), &bodyMap); err == nil {
		bodyMap["store"] = false
		newBody, _ := json.Marshal(bodyMap)
		body = string(newBody)
	}

	req, err := http.NewRequest("POST", endpoint, strings.NewReader(body))
	if err != nil {
		return "", err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("LM Studio error (%d): %s", resp.StatusCode, string(body))
	}

	var fullResponse strings.Builder
	reader := bufio.NewReader(resp.Body)
	var eventData []string
	
	for {
		line, err := reader.ReadString('\n')
		if err != nil && err != io.EOF {
			break
		}
		
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "data:") {
			data := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
			if data != "" {
				eventData = append(eventData, data)
			}
		} else if trimmed == "" && len(eventData) > 0 {
			// End of event block, process joined data
			joined := strings.Join(eventData, "\n")
			eventData = nil
			
			var raw map[string]any
			if err := json.Unmarshal([]byte(joined), &raw); err == nil {
				// Handle events
				eventType, _ := raw["type"].(string)
				if eventType == "" {
					// Some versions might not have "type" at top level but in data
				}

				switch eventType {
				case "model_load.progress", "prompt_processing.progress":
					progress := 0.0
					if p, ok := raw["progress"].(float64); ok {
						progress = p
					}
					label := "Processing..."
					if eventType == "model_load.progress" {
						label = "Loading Model"
					} else {
						label = "Processing Prompt"
					}
					runtime.EventsEmit(a.ctx, "ai:progress", map[string]any{
						"label":    label,
						"progress": progress * 100,
					})
				case "message.start":
					runtime.EventsEmit(a.ctx, "ai:progress", map[string]any{
						"label":    "처리 내용 받는 중...",
						"progress": 100,
						"loading":  true,
					})
				case "message.delta":
					if next, ok := raw["content"].(string); ok {
						fullResponse.WriteString(next)
					}
				case "chat.end":
					runtime.EventsEmit(a.ctx, "ai:progress", map[string]any{
						"label":    "완료 ✨",
						"progress": 100,
						"loading":  false,
					})
				}
			}
		}

		if err == io.EOF {
			break
		}
	}

	return fullResponse.String(), nil
}

