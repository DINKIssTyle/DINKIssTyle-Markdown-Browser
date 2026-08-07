/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

var appIconPNG []byte

var linuxIconPNGBySize map[int][]byte

const (
	defaultRecentFileDisplayLimit = 8
	maxRecentFileDisplayLimit     = 99
	compactScreenMaxWidth         = 1280
	compactScreenMaxHeight        = 768
)

func SetIntegrationIcons(appIcon []byte, linuxIcons map[int][]byte) {
	appIconPNG = appIcon
	linuxIconPNGBySize = linuxIcons
}

// RecentFile represents a recently opened file
type RecentFile struct {
	Path   string `json:"path"`
	Name   string `json:"name"`
	Pinned bool   `json:"pinned"`
}

// FileResult represents the result of opening a file
type FileResult struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type FileTreeNode struct {
	Name     string         `json:"name"`
	Path     string         `json:"path"`
	IsDir    bool           `json:"isDir"`
	HasItems bool           `json:"hasItems"`
	Children []FileTreeNode `json:"children,omitempty"`
}

type AIModelInfo struct {
	ID                    string `json:"id"`
	DisplayName           string `json:"displayName"`
	IsLoaded              bool   `json:"isLoaded"`
	StateLabel            string `json:"stateLabel"`
	PrimaryLoadedInstance string `json:"primaryLoadedInstanceId"`
}

// AppSettings represents the application settings
type AppSettings struct {
	Theme                    string            `json:"theme"`
	ThemeMode                string            `json:"themeMode"`
	LightAccentColor         string            `json:"lightAccentColor"`
	DarkAccentColor          string            `json:"darkAccentColor"`
	ScrollbarVisibility      string            `json:"scrollbarVisibility"`
	MainToolbarNewDocument   bool              `json:"mainToolbarNewDocument"`
	MainToolbarEdit          bool              `json:"mainToolbarEdit"`
	MainToolbarTranslate     bool              `json:"mainToolbarTranslate"`
	MainToolbarFontSize      bool              `json:"mainToolbarFontSize"`
	MainToolbarTheme         bool              `json:"mainToolbarTheme"`
	FontSize                 int               `json:"fontSize"`
	Engine                   string            `json:"engine"`
	EditorRenderMode         string            `json:"editorRenderMode"`
	EditorToolbarMode        string            `json:"editorToolbarMode"`
	EditorAuthor             string            `json:"editorAuthor"`
	EditorPreviewScrollSync  bool              `json:"editorPreviewScrollSync"`
	EditorOrderedListStyle   string            `json:"editorOrderedListStyle"`
	EditorTokenColorsEnabled bool              `json:"editorTokenColorsEnabled"`
	EditorTokenColors        map[string]string `json:"editorTokenColors"`
	EditorBackgroundColor    string            `json:"editorBackgroundColor"`
	FileTreeFilterEnabled    bool              `json:"fileTreeFilterEnabled"`
	RecentFileDisplayLimit   int               `json:"recentFileDisplayLimit"`
	OutlineHeadingFormat     bool              `json:"outlineHeadingFormat"`
	AIFeaturesDisabled       bool              `json:"aiFeaturesDisabled"`
	AIGeneralEnabled         bool              `json:"aiGeneralEnabled"`
	AIGeneralToolbarEnabled  bool              `json:"aiGeneralToolbarEnabled"`
	AIToolbarCollapsed       bool              `json:"aiToolbarCollapsed"`
	AIGeneralEndpoint        string            `json:"aiGeneralEndpoint"`
	AIGeneralModel           string            `json:"aiGeneralModel"`
	AIGeneralKey             string            `json:"aiGeneralKey"`
	AIGeneralTemp            float64           `json:"aiGeneralTemp"`
	AIFIMEnabled             bool              `json:"aiFimEnabled"`
	AIFIMToolbarEnabled      bool              `json:"aiFimToolbarEnabled"`
	AIFIMEndpoint            string            `json:"aiFimEndpoint"`
	AIFIMModel               string            `json:"aiFimModel"`
	AIFIMKey                 string            `json:"aiFimKey"`
	AIFIMTemp                float64           `json:"aiFimTemp"`
	AIGeneralProvider        string            `json:"aiGeneralProvider"` // "openai" or "lmstudio"
	AISelectionContext       bool              `json:"aiSelectionContext"`
	AIGithubCompatible       bool              `json:"aiGithubCompatible"`
	AISupportAgent           bool              `json:"aiSupportAgent"`
	KoreanImeEnterFix        bool              `json:"koreanImeEnterFix"`
	LastVersion              string            `json:"lastVersion"`
	UpdateCheckInterval      string            `json:"updateCheckInterval"`
	LastUpdateCheck          string            `json:"lastUpdateCheck"`
	DocumentMargin           string            `json:"documentMargin"`
	ViewerFontFamily         string            `json:"viewerFontFamily"`
}

// App struct
type App struct {
	wailsApp           *application.App
	window             *application.WebviewWindow
	settingsPath       string
	recentPath         string
	storageMu          sync.Mutex
	mobileStorageReady bool
	mu                 sync.Mutex
	settingsMu         sync.Mutex
	systemFontsOnce    sync.Once
	systemFonts        []FontInfo
	activeAIRequestID  int64
	activeAICancel     context.CancelFunc
	frontendReady      bool
	pendingOpenFiles   []string
	showWhatsNew       bool
	editorState        EditorSessionState
	allowNextQuit      bool
}

type EditorSessionState struct {
	IsEditing   bool
	HasUnsaved  bool
	CurrentPath string
	Content     string
	Title       string
}

func (a *App) beginAIRequest() (context.Context, context.CancelFunc, int64) {
	a.mu.Lock()
	defer a.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	a.activeAIRequestID++
	requestID := a.activeAIRequestID
	a.activeAICancel = cancel
	return ctx, cancel, requestID
}

func (a *App) finishAIRequest(requestID int64) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.activeAIRequestID != requestID {
		return
	}
	a.activeAICancel = nil
}

func (a *App) CancelAIRequest() {
	a.mu.Lock()
	cancel := a.activeAICancel
	a.activeAICancel = nil
	a.activeAIRequestID++
	a.mu.Unlock()

	if cancel != nil {
		cancel()
	}
}

// NewApp creates a new App application struct
func NewApp() *App {
	configDir, _ := os.UserConfigDir()
	appDir := filepath.Join(configDir, AppName)
	os.MkdirAll(appDir, 0755)

	return &App{
		settingsPath: filepath.Join(appDir, "settings.json"),
		recentPath:   filepath.Join(appDir, "recent.json"),
	}
}

// Startup is called when the app starts. The context is saved.
//
//wails:ignore
func (a *App) AttachRuntime(wailsApp *application.App, window *application.WebviewWindow) {
	a.wailsApp = wailsApp
	a.window = window
}

func (a *App) ensurePersistentPaths() {
	if !application.System.IsMobile() {
		return
	}

	a.storageMu.Lock()
	defer a.storageMu.Unlock()
	if a.mobileStorageReady {
		return
	}

	storageRoot := strings.TrimSpace(application.Mobile.StoragePath())
	if storageRoot == "" {
		return
	}
	appDir := filepath.Join(storageRoot, "dkst-markdown-browser")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		log.Printf("mobile-storage: create directory failed path=%s err=%v", appDir, err)
		return
	}
	a.settingsPath = filepath.Join(appDir, "settings.json")
	a.recentPath = filepath.Join(appDir, "recent.json")
	a.mobileStorageReady = true
}

func (a *App) emit(name string, data ...any) {
	if a.wailsApp != nil {
		a.wailsApp.Event.Emit(name, data...)
	}
}

func (a *App) showMainWindow() {
	if a.window == nil {
		return
	}
	a.window.UnMinimise()
	a.window.Show()
}

func (a *App) showError(title, message string) {
	if a.wailsApp == nil {
		log.Printf("%s: %s", title, message)
		return
	}
	a.wailsApp.Dialog.Error().
		AttachToWindow(a.window).
		SetTitle(title).
		SetMessage(message).
		Show()
}

func (a *App) askDialog(title, message string, labels []string, defaultLabel, cancelLabel string) string {
	if a.wailsApp == nil {
		return cancelLabel
	}
	result := make(chan string, 1)
	dialog := a.wailsApp.Dialog.Question().AttachToWindow(a.window).SetTitle(title).SetMessage(message)
	for _, label := range labels {
		label := label
		button := dialog.AddButton(label).OnClick(func() {
			select {
			case result <- label:
			default:
			}
		})
		if label == defaultLabel {
			dialog.SetDefaultButton(button)
		}
		if label == cancelLabel {
			dialog.SetCancelButton(button)
		}
	}
	dialog.Show()
	return <-result
}

//wails:ignore
func (a *App) Startup() {

	// Check version for "What's New"
	settings := a.GetSettings()
	if settings.LastVersion != AppVersion {
		a.showWhatsNew = true
		settings.LastVersion = AppVersion
		a.SaveSettings(settings)
	}

	a.queueOpenRequests(os.Args[1:], "")
}

// DomReady adjusts the initial window state after the native window is ready.
// Compact displays use the operating system's maximised work area, while larger
// displays keep the configured 1200x800 startup size.
//
//wails:ignore
func (a *App) DomReady() {
	installHistoryNavigationBridge(a.window)

	if a.wailsApp == nil {
		return
	}
	screens := a.wailsApp.Screen.GetAll()

	screen, ok := startupScreen(screens)
	if ok && shouldMaximiseOnStartup(screen) {
		a.window.Maximise()
	}
}

func startupScreen(screens []*application.Screen) (*application.Screen, bool) {
	for _, screen := range screens {
		if screen.IsPrimary {
			return screen, true
		}
	}
	if len(screens) > 0 {
		return screens[0], true
	}
	return nil, false
}

func shouldMaximiseOnStartup(screen *application.Screen) bool {
	if screen == nil {
		return false
	}
	width := screen.Size.Width
	height := screen.Size.Height
	if width <= 0 || height <= 0 {
		return false
	}
	return width <= compactScreenMaxWidth || height <= compactScreenMaxHeight
}

func (a *App) SyncEditorState(isEditing bool, hasUnsaved bool, currentPath string, content string, title string) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.editorState = EditorSessionState{
		IsEditing:   isEditing,
		HasUnsaved:  hasUnsaved,
		CurrentPath: strings.TrimSpace(currentPath),
		Content:     content,
		Title:       strings.TrimSpace(title),
	}
}

//wails:ignore
func (a *App) OnBeforeClose() bool {
	a.mu.Lock()
	editorState := a.editorState
	a.mu.Unlock()

	if !editorState.IsEditing || !editorState.HasUnsaved {
		return false
	}

	displayTitle := strings.TrimSpace(editorState.Title)
	if displayTitle == "" && strings.TrimSpace(editorState.CurrentPath) != "" {
		displayTitle = filepath.Base(editorState.CurrentPath)
	}
	response := a.AskSaveDiscardCancel("Unsaved Changes", buildSaveChangesMessage(displayTitle, "The document has been modified. Do you want to save changes before quitting?"))
	switch response {
	case "Save":
		if strings.TrimSpace(editorState.CurrentPath) == "" {
			a.showError("Save Failed", "This document does not have a save path yet. Save it manually before quitting.")
			return true
		}
		if err := a.SaveFile(editorState.CurrentPath, editorState.Content); err != nil {
			a.showError("Save Failed", fmt.Sprintf("Failed to save changes before quitting.\n\n%s", err))
			return true
		}
		return false
	case "Discard":
		return false
	default:
		return true
	}
}

//wails:ignore
func (a *App) HandleWindowClosing() bool {
	cancel := a.OnBeforeClose()
	if !cancel {
		a.mu.Lock()
		a.allowNextQuit = true
		a.mu.Unlock()
	}
	return cancel
}

//wails:ignore
func (a *App) ShouldQuit() bool {
	a.mu.Lock()
	if a.allowNextQuit {
		a.allowNextQuit = false
		a.mu.Unlock()
		return true
	}
	a.mu.Unlock()
	return !a.OnBeforeClose()
}

// FrontendReady marks the UI as ready to receive open-file events and returns queued paths.
func (a *App) FrontendReady() []string {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.frontendReady = true

	if a.showWhatsNew {
		a.emit("app:show-whats-new", AppVersion)
		a.showWhatsNew = false
	}

	paths := append([]string(nil), a.pendingOpenFiles...)
	a.pendingOpenFiles = nil
	return paths
}

// OpenFile opens a file dialog and returns the file path and content
func (a *App) OpenFile() (FileResult, error) {
	selection, err := a.wailsApp.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title: "Open Document",
		Filters: []application.FileFilter{
			{DisplayName: "Document Files (*.md;*.markdown;*.html;*.htm)", Pattern: "*.md;*.markdown;*.html;*.htm"},
		},
		Window: a.window,
	}).PromptForSingleSelection()
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
func (a *App) SelectDocument(basePath string) (string, error) {
	selection, err := a.wailsApp.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:     "Select Document",
		Directory: defaultDirectoryForBasePath(basePath),
		Filters: []application.FileFilter{
			{DisplayName: "Document Files", Pattern: "*.md;*.markdown;*.html;*.htm"},
		},
		Window: a.window,
	}).PromptForSingleSelection()
	return selection, err
}

// SelectImage opens a file dialog to select an image for insertion
func (a *App) SelectImage(basePath string) (string, error) {
	selection, err := a.wailsApp.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:     "Select Image",
		Directory: defaultDirectoryForBasePath(basePath),
		Filters: []application.FileFilter{
			{DisplayName: "Image Files", Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg;*.bmp;*.ico"},
		},
		Window: a.window,
	}).PromptForSingleSelection()
	return selection, err
}

func defaultDirectoryForBasePath(basePath string) string {
	if basePath == "" {
		return ""
	}

	cleanPath := filepath.Clean(basePath)
	if info, err := os.Stat(cleanPath); err == nil {
		if info.IsDir() {
			return cleanPath
		}
		return filepath.Dir(cleanPath)
	}

	dir := filepath.Dir(cleanPath)
	if info, err := os.Stat(dir); err == nil && info.IsDir() {
		return dir
	}
	return ""
}

// ShowSaveFileDialog opens a dialog to save a new file
func (a *App) ShowSaveFileDialog(defaultName string) (string, error) {
	selection, err := a.wailsApp.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:                "Save File",
		Filename:             defaultName,
		CanCreateDirectories: true,
		Filters: []application.FileFilter{
			{DisplayName: "Markdown Files", Pattern: "*.md;*.markdown"},
		},
		Window: a.window,
	}).PromptForSingleSelection()
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

// GetDefaultStorageDirectory returns the platform standard document storage directory.
// On iOS: ~/Documents (exposed in iOS Files app)
// On Android: Public /storage/emulated/0/Documents or app internal Documents
// On Desktop: User's Documents directory
func (a *App) GetDefaultStorageDirectory() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}

	var target string
	switch goruntime.GOOS {
	case "ios":
		target = filepath.Join(home, "Documents")
	case "android":
		pubDocs := "/storage/emulated/0/Documents"
		if err := os.MkdirAll(pubDocs, 0755); err == nil {
			target = pubDocs
		} else {
			target = filepath.Join(home, "Documents")
		}
	default:
		target = filepath.Join(home, "Documents")
		if _, err := os.Stat(target); os.IsNotExist(err) {
			target = home
		}
	}

	if err := os.MkdirAll(target, 0755); err != nil {
		log.Printf("GetDefaultStorageDirectory: MkdirAll failed target=%s: %v", target, err)
	}

	return filepath.Clean(target), nil
}

func (a *App) ListFileTree(root string) (FileTreeNode, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return FileTreeNode{}, errors.New("root path is empty")
	}

	cleanRoot := filepath.Clean(root)
	info, err := os.Stat(cleanRoot)
	if err != nil {
		return FileTreeNode{}, err
	}
	if !info.IsDir() {
		cleanRoot = filepath.Dir(cleanRoot)
		info, err = os.Stat(cleanRoot)
		if err != nil {
			return FileTreeNode{}, err
		}
	}
	if !info.IsDir() {
		return FileTreeNode{}, fmt.Errorf("root path is not a directory")
	}

	return buildFileTreeNode(cleanRoot, true)
}

func buildFileTreeNode(path string, includeChildren bool) (FileTreeNode, error) {
	info, err := os.Stat(path)
	if err != nil {
		return FileTreeNode{}, err
	}

	node := FileTreeNode{
		Name:     info.Name(),
		Path:     path,
		IsDir:    info.IsDir(),
		HasItems: info.IsDir() && directoryHasItems(path),
	}

	if !info.IsDir() || !includeChildren {
		return node, nil
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return node, nil
	}

	sort.SliceStable(entries, func(i, j int) bool {
		left := entries[i]
		right := entries[j]
		if left.IsDir() != right.IsDir() {
			return left.IsDir()
		}
		return strings.ToLower(left.Name()) < strings.ToLower(right.Name())
	})

	for _, entry := range entries {
		childPath := filepath.Join(path, entry.Name())
		if entry.Type()&os.ModeSymlink != 0 {
			info, err := entry.Info()
			if err != nil {
				continue
			}
			node.Children = append(node.Children, FileTreeNode{
				Name:     entry.Name(),
				Path:     childPath,
				IsDir:    info.IsDir(),
				HasItems: info.IsDir() && directoryHasItems(childPath),
			})
			continue
		}

		child, err := buildFileTreeNode(childPath, false)
		if err != nil {
			continue
		}
		node.Children = append(node.Children, child)
	}

	return node, nil
}

func directoryHasItems(path string) bool {
	entries, err := os.ReadDir(path)
	return err == nil && len(entries) > 0
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
	a.ensurePersistentPaths()
	var recent []RecentFile
	data, err := os.ReadFile(a.recentPath)
	if err != nil {
		return []RecentFile{}
	}

	json.Unmarshal(data, &recent)
	return orderRecentFiles(recent)
}

func (a *App) saveRecentFile(path string) {
	a.ensurePersistentPaths()
	recent := a.GetRecentFiles()

	// Check if already exists
	pinned := false
	for _, rf := range recent {
		if rf.Path == path {
			pinned = rf.Pinned
			break
		}
	}

	newRecent := []RecentFile{{Path: path, Name: filepath.Base(path), Pinned: pinned}}
	for _, rf := range recent {
		if rf.Path != path {
			newRecent = append(newRecent, rf)
		}
	}

	newRecent = trimRecentFiles(orderRecentFiles(newRecent))

	data, _ := json.Marshal(newRecent)
	os.WriteFile(a.recentPath, data, 0644)
}

func orderRecentFiles(recent []RecentFile) []RecentFile {
	ordered := make([]RecentFile, 0, len(recent))
	for _, rf := range recent {
		if rf.Pinned {
			ordered = append(ordered, rf)
		}
	}
	for _, rf := range recent {
		if !rf.Pinned {
			ordered = append(ordered, rf)
		}
	}
	return ordered
}

func trimRecentFiles(recent []RecentFile) []RecentFile {
	trimmed := make([]RecentFile, 0, len(recent))
	regularCount := 0
	for _, rf := range recent {
		if rf.Pinned {
			trimmed = append(trimmed, rf)
			continue
		}
		if regularCount >= maxRecentFileDisplayLimit {
			continue
		}
		trimmed = append(trimmed, rf)
		regularCount++
	}
	return trimmed
}

// ToggleRecentFilePinned pins or unpins a recent file.
func (a *App) ToggleRecentFilePinned(path string) []RecentFile {
	cleanPath := strings.TrimSpace(path)
	if cleanPath == "" {
		return a.GetRecentFiles()
	}

	recent := a.GetRecentFiles()
	for i, rf := range recent {
		if rf.Path == cleanPath {
			updated := rf
			updated.Pinned = !rf.Pinned
			updated.Name = filepath.Base(cleanPath)
			recent = append([]RecentFile{updated}, append(recent[:i], recent[i+1:]...)...)
			recent = trimRecentFiles(orderRecentFiles(recent))
			data, _ := json.Marshal(recent)
			os.WriteFile(a.recentPath, data, 0644)
			return recent
		}
	}

	recent = append([]RecentFile{{Path: cleanPath, Name: filepath.Base(cleanPath), Pinned: true}}, recent...)
	recent = trimRecentFiles(orderRecentFiles(recent))
	data, _ := json.Marshal(recent)
	os.WriteFile(a.recentPath, data, 0644)
	return recent
}

// TouchRecentFile moves a file to the top of the recent list.
func (a *App) TouchRecentFile(path string) {
	cleanPath := strings.TrimSpace(path)
	if cleanPath == "" {
		return
	}
	a.saveRecentFile(cleanPath)
}

// ClearRecentFiles clears unpinned recent files while preserving pinned entries.
func (a *App) ClearRecentFiles() {
	recent := a.GetRecentFiles()
	pinned := make([]RecentFile, 0, len(recent))
	for _, rf := range recent {
		if rf.Pinned {
			pinned = append(pinned, rf)
		}
	}

	data, _ := json.Marshal(pinned)
	os.WriteFile(a.recentPath, data, 0644)
}

// GetSettings loads the application settings
func (a *App) GetSettings() AppSettings {
	a.ensurePersistentPaths()
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	return a.getSettingsUnlocked()
}

func (a *App) getSettingsUnlocked() AppSettings {
	var settings AppSettings
	// Default settings
	settings.Theme = "auto"     // "auto" | "light" | "dark"
	settings.ThemeMode = "auto" // "auto" | "light" | "dark"
	settings.LightAccentColor = "#0071e3"
	settings.DarkAccentColor = "#0a84ff"
	settings.ScrollbarVisibility = "always" // "when-scrolling" | "always"
	settings.MainToolbarNewDocument = true
	settings.MainToolbarEdit = true
	settings.MainToolbarTranslate = true
	settings.MainToolbarFontSize = true
	settings.MainToolbarTheme = true
	settings.FontSize = 16
	settings.Engine = "marked"              // "marked" | "html"
	settings.EditorRenderMode = "realtime"  // "realtime" | "cursor"
	settings.EditorToolbarMode = "beginner" // "beginner" | "rookie" | "pro"
	settings.EditorAuthor = ""
	settings.EditorPreviewScrollSync = true
	settings.EditorOrderedListStyle = "standard" // "standard" | "incremental"
	settings.EditorTokenColorsEnabled = true
	settings.EditorTokenColors = map[string]string{}
	settings.EditorBackgroundColor = ""
	settings.FileTreeFilterEnabled = false
	settings.RecentFileDisplayLimit = defaultRecentFileDisplayLimit
	settings.OutlineHeadingFormat = false
	settings.AIGeneralEnabled = true
	settings.AIGeneralToolbarEnabled = true
	settings.AIToolbarCollapsed = false
	settings.AIGeneralProvider = "lmstudio" // "openai" | "lmstudio"
	settings.AIGeneralTemp = 0.0
	settings.AIFIMEnabled = true
	settings.AIFIMToolbarEnabled = false
	settings.AIFIMTemp = 0.0
	settings.DocumentMargin = "none"
	settings.ViewerFontFamily = ""
	settings.UpdateCheckInterval = updateCheckIntervalWeekly

	data, err := os.ReadFile(a.settingsPath)
	if err == nil {
		json.Unmarshal(data, &settings)
	}
	normalizeSettings(&settings)
	return settings
}

// SaveSettings saves the application settings
func (a *App) SaveSettings(settings AppSettings) {
	a.ensurePersistentPaths()
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	a.saveSettingsUnlocked(settings)
}

func (a *App) saveSettingsUnlocked(settings AppSettings) {
	normalizeSettings(&settings)
	data, _ := json.Marshal(settings)
	os.WriteFile(a.settingsPath, data, 0644)
}

func normalizeSettings(settings *AppSettings) {
	switch settings.ScrollbarVisibility {
	case "when-scrolling", "always":
	default:
		settings.ScrollbarVisibility = "always"
	}
	switch settings.UpdateCheckInterval {
	case updateCheckIntervalNever, updateCheckIntervalDaily, updateCheckIntervalWeekly, updateCheckIntervalMonthly:
	default:
		settings.UpdateCheckInterval = updateCheckIntervalWeekly
	}
	if settings.RecentFileDisplayLimit < 0 {
		settings.RecentFileDisplayLimit = 0
	}
	if settings.RecentFileDisplayLimit > maxRecentFileDisplayLimit {
		settings.RecentFileDisplayLimit = maxRecentFileDisplayLimit
	}
	if settings.DocumentMargin == "" {
		settings.DocumentMargin = "none"
	}
}

// GetSystemTheme returns the current theme (light/dark)
func (a *App) GetSystemTheme() string {
	// This is a placeholder, Wails usually provides theme info via runtime
	// or we can just default to dark for premium look.
	return "dark"
}

// OpenDirectory opens a directory dialog
func (a *App) OpenDirectory() (string, error) {
	selection, err := a.wailsApp.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:                "Select Folder for Search",
		CanChooseDirectories: true,
		CanChooseFiles:       false,
		Window:               a.window,
	}).PromptForSingleSelection()
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

	response := a.askDialog(title, message, buttons, okText, cancelText)
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

	response := a.askDialog(title, message, buttons, "Save", "Cancel")
	return normalizeSaveDiscardCancelResponse(response)
}

func normalizeSaveDiscardCancelResponse(response string) string {
	normalized := strings.ToLower(strings.TrimSpace(response))

	switch normalized {
	case "save", "yes", "ok", "예":
		return "Save"
	case "discard", "don't save", "dont save", "no", "아니오":
		return "Discard"
	case "cancel", "취소":
		return "Cancel"
	default:
		return strings.TrimSpace(response)
	}
}

func buildSaveChangesMessage(title string, prompt string) string {
	trimmedTitle := strings.TrimSpace(title)
	if trimmedTitle == "" {
		return prompt
	}
	return fmt.Sprintf("%s\n\n%s", trimmedTitle, prompt)
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

//wails:ignore
func (a *App) HandleSystemOpenFile(path string) {
	a.queueOpenRequests([]string{path}, "")
	a.showMainWindow()
}

//wails:ignore
func (a *App) HandleSecondInstanceLaunch(data application.SecondInstanceData) {
	log.Printf("second-instance: cwd=%s args=%v", data.WorkingDir, data.Args)
	a.queueOpenRequests(data.Args, data.WorkingDir)
	a.showMainWindow()
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
		if ready {
			a.emit("system:open-file", resolvedPath)
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
	case "ios", "android":
		application.Mobile.OpenURL(url)
		log.Printf("external-url: launched native mobile url=%s", url)
		return nil
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

// PrintCurrentWindow opens the native print dialog for the current app window.
func (a *App) PrintCurrentWindow() {
	printCurrentWindow(a.window)
}

// ShowPageSetup opens the native page setup dialog for print paper and orientation.
func (a *App) ShowPageSetup() {
	showPageSetup(a.window)
}

// MakeAIRequest proxies a POST request to avoid CORS issues caused by local AI servers
func (a *App) MakeAIRequest(endpoint string, headers map[string]string, body string) (string, error) {
	ctx, cancel, requestID := a.beginAIRequest()
	defer cancel()
	defer a.finishAIRequest(requestID)

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, strings.NewReader(body))
	if err != nil {
		return "", err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return "", context.Canceled
		}
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return string(respBody), fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	if isEventStreamResponse(resp) {
		result, err := a.readOpenAICompatibleAIStream(resp.Body)
		if err != nil {
			return "", err
		}
		return result, nil
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return string(respBody), nil
}

func isEventStreamResponse(resp *http.Response) bool {
	return strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream")
}

func (a *App) readOpenAICompatibleAIStream(body io.Reader) (string, error) {
	var fullResponse strings.Builder
	reader := bufio.NewReader(body)
	var eventData []string

	appendEvent := func(joined string) {
		var raw map[string]any
		if json.Unmarshal([]byte(joined), &raw) != nil {
			return
		}
		for _, next := range extractOpenAIStreamContent(raw) {
			fullResponse.WriteString(next)
			a.emit("ai:delta", map[string]any{
				"kind": "message",
				"text": next,
			})
		}
	}

	for {
		line, err := reader.ReadString('\n')
		if err != nil && err != io.EOF {
			return "", err
		}

		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "data:") {
			data := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
			if data != "" && data != "[DONE]" {
				eventData = append(eventData, data)
			}
		} else if trimmed == "" && len(eventData) > 0 {
			appendEvent(strings.Join(eventData, "\n"))
			eventData = nil
		}

		if err == io.EOF {
			if len(eventData) > 0 {
				appendEvent(strings.Join(eventData, "\n"))
			}
			break
		}
	}

	payload := map[string]any{
		"choices": []map[string]any{
			{
				"message": map[string]string{
					"content": fullResponse.String(),
				},
			},
		},
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

// GetAIModelList fetches available model IDs from an OpenAI-compatible /v1/models endpoint.
func (a *App) GetAIModelList(endpoint string, headers map[string]string) ([]string, error) {
	respBody, err := fetchAIEndpointJSON(endpoint, headers, []string{"/api/v1/models", "/v1/models"})
	if err != nil {
		return nil, err
	}

	rawModels, err := extractRawModelEntries(respBody)
	if err != nil {
		return nil, err
	}

	models := make([]string, 0, len(rawModels))
	for _, raw := range rawModels {
		if model, ok := normalizeAIModelInfo(raw); ok && strings.TrimSpace(model.ID) != "" {
			models = append(models, model.ID)
			continue
		}

		var directID string
		if err := json.Unmarshal(raw, &directID); err == nil && strings.TrimSpace(directID) != "" {
			models = append(models, strings.TrimSpace(directID))
		}
	}
	return models, nil
}

func (a *App) GetAIModelCatalog(endpoint string, headers map[string]string) ([]AIModelInfo, error) {
	respBody, err := fetchAIEndpointJSON(endpoint, headers, []string{"/api/v1/models", "/v1/models"})
	if err != nil {
		return nil, err
	}

	rawModels, err := extractRawModelEntries(respBody)
	if err != nil {
		return nil, err
	}

	models := make([]AIModelInfo, 0, len(rawModels))
	for _, raw := range rawModels {
		model, ok := normalizeAIModelInfo(raw)
		if ok {
			models = append(models, model)
		}
	}

	return models, nil
}

func (a *App) UnloadAIModel(endpoint string, headers map[string]string, instanceID string) error {
	instanceID = strings.TrimSpace(instanceID)
	if instanceID == "" {
		return fmt.Errorf("instance_id is required")
	}

	body, err := json.Marshal(map[string]string{
		"instance_id": instanceID,
	})
	if err != nil {
		return err
	}

	_, err = doAIEndpointRequest("POST", endpoint, headers, []string{"/api/v1/models/unload", "/v1/models/unload"}, string(body))
	return err
}

func fetchAIEndpointJSON(endpoint string, headers map[string]string, paths []string) ([]byte, error) {
	return doAIEndpointRequest("GET", endpoint, headers, paths, "")
}

func doAIEndpointRequest(method string, endpoint string, headers map[string]string, paths []string, body string) ([]byte, error) {
	base := normalizeAIEndpointBase(endpoint)
	var lastErr error

	for _, requestURL := range candidateAIURLs(base, endpoint, paths) {
		req, err := http.NewRequest(method, requestURL, strings.NewReader(body))
		if err != nil {
			lastErr = err
			continue
		}
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		if method != http.MethodGet {
			req.Header.Set("Content-Type", "application/json")
		}

		client := &http.Client{Timeout: 20 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		respBody, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
			continue
		}
		return respBody, nil
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("request failed")
	}
	return nil, lastErr
}

func candidateAIURLs(base string, original string, paths []string) []string {
	seen := map[string]bool{}
	urls := make([]string, 0, len(paths)+1)
	trimmedOriginal := strings.TrimSpace(original)

	if strings.HasPrefix(trimmedOriginal, "http://") || strings.HasPrefix(trimmedOriginal, "https://") {
		normalizedOriginal := strings.TrimRight(trimmedOriginal, "/")
		if looksLikeDirectAIEndpoint(normalizedOriginal) {
			seen[normalizedOriginal] = true
			urls = append(urls, normalizedOriginal)
		}
	}

	for _, path := range paths {
		candidate := strings.TrimRight(base, "/") + path
		if candidate == "" || seen[candidate] {
			continue
		}
		seen[candidate] = true
		urls = append(urls, candidate)
	}
	return urls
}

func normalizeAIEndpointBase(endpoint string) string {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return ""
	}
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		endpoint = "http://" + endpoint
	}
	endpoint = strings.TrimRight(endpoint, "/")
	suffixes := []string{
		"/api/v1/models/unload",
		"/v1/models/unload",
		"/api/v1/models",
		"/v1/models",
		"/api/v1/chat",
		"/v1/chat/completions",
		"/api/v1",
		"/v1",
	}
	for _, suffix := range suffixes {
		if strings.HasSuffix(endpoint, suffix) {
			return strings.TrimSuffix(endpoint, suffix)
		}
	}
	return endpoint
}

func looksLikeDirectAIEndpoint(endpoint string) bool {
	suffixes := []string{
		"/api/v1/models",
		"/v1/models",
		"/api/v1/models/unload",
		"/v1/models/unload",
	}
	for _, suffix := range suffixes {
		if strings.HasSuffix(endpoint, suffix) {
			return true
		}
	}
	return false
}

func extractRawModelEntries(respBody []byte) ([]json.RawMessage, error) {
	var direct []json.RawMessage
	if err := json.Unmarshal(respBody, &direct); err == nil && len(direct) > 0 {
		return direct, nil
	}

	var payload map[string]json.RawMessage
	if err := json.Unmarshal(respBody, &payload); err != nil {
		return nil, err
	}
	for _, key := range []string{"data", "Data", "models", "Models", "items", "Items"} {
		if raw, ok := payload[key]; ok {
			var nested []json.RawMessage
			if err := json.Unmarshal(raw, &nested); err == nil && len(nested) > 0 {
				return nested, nil
			}
		}
	}
	for _, raw := range payload {
		var nested []json.RawMessage
		if err := json.Unmarshal(raw, &nested); err == nil && len(nested) > 0 {
			return nested, nil
		}
	}
	return nil, nil
}

func normalizeAIModelInfo(raw json.RawMessage) (AIModelInfo, bool) {
	var item map[string]any
	if err := json.Unmarshal(raw, &item); err != nil {
		return AIModelInfo{}, false
	}

	modelType := strings.ToLower(strings.TrimSpace(firstNonEmptyString(
		stringFromAny(item["type"]),
		nestedString(item, "metadata", "type"),
		nestedString(item, "model_info", "type"),
	)))
	if modelType != "" && modelType != "llm" {
		return AIModelInfo{}, false
	}

	id := firstNonEmptyString(
		stringFromAny(item["id"]),
		stringFromAny(item["key"]),
		stringFromAny(item["model"]),
		stringFromAny(item["name"]),
		stringFromAny(item["model_id"]),
	)
	if id == "" {
		return AIModelInfo{}, false
	}

	displayName := firstNonEmptyString(
		stringFromAny(item["display_name"]),
		stringFromAny(item["displayName"]),
		stringFromAny(item["name"]),
		stringFromAny(item["key"]),
		id,
	)

	loadedInstances := rawMapSlice(item["loaded_instances"])
	primaryInstanceID := ""
	for _, instance := range loadedInstances {
		primaryInstanceID = firstNonEmptyString(
			stringFromAny(instance["instance_id"]),
			stringFromAny(instance["id"]),
		)
		if primaryInstanceID != "" {
			break
		}
	}

	stateLabel := strings.ToLower(strings.TrimSpace(firstNonEmptyString(
		stringFromAny(item["state"]),
		stringFromAny(item["status"]),
		stringFromAny(item["load_state"]),
		nestedString(item, "metadata", "state"),
		nestedString(item, "model_info", "state"),
	)))
	rawLoaded := boolFromAny(item["loaded"]) ||
		boolFromAny(item["is_loaded"]) ||
		boolFromAny(item["currently_loaded"]) ||
		nestedBool(item, "metadata", "loaded") ||
		nestedBool(item, "model_info", "loaded")

	isLoaded := len(loadedInstances) > 0 || rawLoaded || containsString([]string{"loaded", "active", "ready", "resident"}, stateLabel)

	return AIModelInfo{
		ID:                    id,
		DisplayName:           displayName,
		IsLoaded:              isLoaded,
		StateLabel:            stateLabel,
		PrimaryLoadedInstance: primaryInstanceID,
	}, true
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func stringFromAny(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	default:
		return ""
	}
}

func boolFromAny(value any) bool {
	v, ok := value.(bool)
	return ok && v
}

func rawMapSlice(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if ok {
			result = append(result, m)
		}
	}
	return result
}

func nestedString(item map[string]any, parent string, key string) string {
	parentMap, ok := item[parent].(map[string]any)
	if !ok {
		return ""
	}
	return stringFromAny(parentMap[key])
}

func nestedBool(item map[string]any, parent string, key string) bool {
	parentMap, ok := item[parent].(map[string]any)
	if !ok {
		return false
	}
	return boolFromAny(parentMap[key])
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
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

	ctx, cancel, requestID := a.beginAIRequest()
	defer cancel()
	defer a.finishAIRequest(requestID)

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, strings.NewReader(body))
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
		if errors.Is(err, context.Canceled) {
			return "", context.Canceled
		}
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
			if errors.Is(err, context.Canceled) {
				return "", context.Canceled
			}
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
					a.emit("ai:progress", map[string]any{
						"label":    label,
						"progress": progress * 100,
					})
				case "message.start":
					a.emit("ai:progress", map[string]any{
						"label":    "Receiving processing...",
						"progress": 100,
						"loading":  true,
					})
				case "message.delta":
					if next, ok := raw["content"].(string); ok {
						fullResponse.WriteString(next)
						a.emit("ai:delta", map[string]any{
							"kind": "message",
							"text": next,
						})
					}
				case "reasoning.delta":
					a.emit("ai:delta", map[string]any{
						"kind": "reasoning",
					})
					a.emit("ai:reasoning", map[string]any{
						"text": "Thinking...",
					})
				case "chat.end":
					a.emit("ai:progress", map[string]any{
						"label":     "Completed ✨",
						"progress":  100,
						"loading":   false,
						"completed": true,
					})
				}
			}
		}

		if err == io.EOF {
			break
		}
	}

	if ctx.Err() != nil {
		return "", ctx.Err()
	}

	return fullResponse.String(), nil
}

// GetVersion returns the application version
func (a *App) GetVersion() string {
	return AppVersion
}

func (a *App) InstallSystemIntegration() (string, error) {
	if goruntime.GOOS != "linux" {
		return "", errors.New("system integration is only available on Ubuntu/Linux")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}

	binPath := filepath.Join(home, ".local", "bin", "dkst-markdown-browser")
	pixmapPath := filepath.Join(home, ".local", "share", "pixmaps", "dkst-markdown-browser.png")
	desktopPath := filepath.Join(home, ".local", "share", "applications", "dkst-markdown-browser.desktop")
	mimePackagePath := filepath.Join(home, ".local", "share", "mime", "packages", "dkst-markdown-browser.xml")

	if err := os.MkdirAll(filepath.Dir(binPath), 0755); err != nil {
		return "", err
	}
	if same, err := sameFile(exe, binPath); err != nil || !same {
		if err := copyFile(exe, binPath, 0755); err != nil {
			return "", err
		}
	}
	if err := os.Chmod(binPath, 0755); err != nil {
		return "", err
	}

	if err := installIconSet(home, "apps", "dkst-markdown-browser"); err != nil {
		return "", err
	}
	if err := installIconSet(home, "mimetypes", "text-markdown"); err != nil {
		return "", err
	}
	if err := installIconSet(home, "mimetypes", "text-x-markdown"); err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(pixmapPath), 0755); err != nil {
		return "", err
	}
	if err := os.WriteFile(pixmapPath, appIconPNG, 0644); err != nil {
		return "", err
	}

	if err := os.MkdirAll(filepath.Dir(desktopPath), 0755); err != nil {
		return "", err
	}
	entry := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=DKST Markdown Browser
Comment=Lightweight Markdown viewer and editor
Exec=%s %%f
Icon=dkst-markdown-browser
Terminal=false
Categories=Utility;TextEditor;
MimeType=text/markdown;text/x-markdown;application/x-markdown;application/x-extension-md;application/x-extension-markdown;
StartupWMClass=DKST Markdown Browser
`, quoteDesktopExec(binPath))
	if err := os.WriteFile(desktopPath, []byte(entry), 0644); err != nil {
		return "", err
	}

	if err := os.MkdirAll(filepath.Dir(mimePackagePath), 0755); err != nil {
		return "", err
	}
	if err := os.WriteFile(mimePackagePath, []byte(markdownMimePackage()), 0644); err != nil {
		return "", err
	}

	refreshDesktopIntegration(home)
	setDefaultMarkdownApp()
	return "Installed app launcher and Markdown file association to ~/.local.", nil
}

func (a *App) UninstallSystemIntegration() (string, error) {
	if goruntime.GOOS != "linux" {
		return "", errors.New("system integration is only available on Ubuntu/Linux")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	targets := []string{
		filepath.Join(home, ".local", "bin", "dkst-markdown-browser"),
		filepath.Join(home, ".local", "share", "pixmaps", "dkst-markdown-browser.png"),
		filepath.Join(home, ".local", "share", "applications", "dkst-markdown-browser.desktop"),
		filepath.Join(home, ".local", "share", "mime", "packages", "dkst-markdown-browser.xml"),
	}
	targets = append(targets, iconSetPaths(home, "apps", "dkst-markdown-browser")...)
	targets = append(targets, iconSetPaths(home, "mimetypes", "text-markdown")...)
	targets = append(targets, iconSetPaths(home, "mimetypes", "text-x-markdown")...)
	for _, target := range targets {
		if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
	}

	refreshDesktopIntegration(home)
	return "Removed installed files from ~/.local.", nil
}

func sameFile(source string, target string) (bool, error) {
	sourceInfo, err := os.Stat(source)
	if err != nil {
		return false, err
	}
	targetInfo, err := os.Stat(target)
	if err != nil {
		return false, err
	}
	return os.SameFile(sourceInfo, targetInfo), nil
}

func copyFile(source string, target string, mode os.FileMode) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer output.Close()

	if _, err := io.Copy(output, input); err != nil {
		return err
	}
	return output.Chmod(mode)
}

func iconSizes() []int {
	return []int{16, 24, 32, 48, 64, 128, 256, 512, 1024}
}

func iconSetPaths(home string, context string, name string) []string {
	paths := make([]string, 0, len(iconSizes()))
	for _, size := range iconSizes() {
		paths = append(paths, filepath.Join(
			home,
			".local",
			"share",
			"icons",
			"hicolor",
			fmt.Sprintf("%dx%d", size, size),
			context,
			name+".png",
		))
	}
	return paths
}

func installIconSet(home string, context string, name string) error {
	for index, path := range iconSetPaths(home, context, name) {
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return err
		}
		size := iconSizes()[index]
		icon, err := linuxIconPNG(size)
		if err != nil {
			return err
		}
		if err := os.WriteFile(path, icon, 0644); err != nil {
			return err
		}
	}
	return nil
}

func linuxIconPNG(size int) ([]byte, error) {
	if icon, ok := linuxIconPNGBySize[size]; ok && len(icon) > 0 {
		return icon, nil
	}
	if size == 1024 {
		if len(appIconPNG) == 0 {
			return nil, fmt.Errorf("app icon is not configured")
		}
		return appIconPNG, nil
	}
	if len(appIconPNG) == 0 {
		return nil, fmt.Errorf("app icon is not configured")
	}
	return resizePNG(appIconPNG, size)
}

func resizePNG(source []byte, size int) ([]byte, error) {
	img, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return nil, err
	}
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		srcY := (float64(y)+0.5)*float64(srcH)/float64(size) - 0.5
		y0, y1, wy := sampleAxis(srcY, srcH)
		for x := 0; x < size; x++ {
			srcX := (float64(x)+0.5)*float64(srcW)/float64(size) - 0.5
			x0, x1, wx := sampleAxis(srcX, srcW)
			dst.SetNRGBA(x, y, bilinearNRGBA(
				img,
				bounds.Min.X+x0,
				bounds.Min.Y+y0,
				bounds.Min.X+x1,
				bounds.Min.Y+y1,
				wx,
				wy,
			))
		}
	}
	var output bytes.Buffer
	if err := png.Encode(&output, dst); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func sampleAxis(value float64, length int) (int, int, float64) {
	if value <= 0 {
		return 0, 0, 0
	}
	maxIndex := length - 1
	if value >= float64(maxIndex) {
		return maxIndex, maxIndex, 0
	}
	index := int(value)
	return index, index + 1, value - float64(index)
}

func bilinearNRGBA(img image.Image, x0 int, y0 int, x1 int, y1 int, wx float64, wy float64) color.NRGBA {
	r00, g00, b00, a00 := img.At(x0, y0).RGBA()
	r10, g10, b10, a10 := img.At(x1, y0).RGBA()
	r01, g01, b01, a01 := img.At(x0, y1).RGBA()
	r11, g11, b11, a11 := img.At(x1, y1).RGBA()

	topR := lerp(float64(r00), float64(r10), wx)
	topG := lerp(float64(g00), float64(g10), wx)
	topB := lerp(float64(b00), float64(b10), wx)
	topA := lerp(float64(a00), float64(a10), wx)
	bottomR := lerp(float64(r01), float64(r11), wx)
	bottomG := lerp(float64(g01), float64(g11), wx)
	bottomB := lerp(float64(b01), float64(b11), wx)
	bottomA := lerp(float64(a01), float64(a11), wx)

	r := lerp(topR, bottomR, wy)
	g := lerp(topG, bottomG, wy)
	b := lerp(topB, bottomB, wy)
	a := lerp(topA, bottomA, wy)
	if a <= 0 {
		return color.NRGBA{}
	}

	return color.NRGBA{
		R: uint8(clampFloat((r*65535/a)/257, 0, 255) + 0.5),
		G: uint8(clampFloat((g*65535/a)/257, 0, 255) + 0.5),
		B: uint8(clampFloat((b*65535/a)/257, 0, 255) + 0.5),
		A: uint8(clampFloat(a/257, 0, 255) + 0.5),
	}
}

func lerp(a float64, b float64, t float64) float64 {
	return a + (b-a)*t
}

func clampFloat(value float64, min float64, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func markdownMimePackage() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="text/markdown">
    <comment>Markdown document</comment>
    <sub-class-of type="text/plain"/>
    <icon name="text-markdown"/>
    <glob pattern="*.md"/>
    <glob pattern="*.markdown"/>
  </mime-type>
</mime-info>
`
}

func quoteDesktopExec(path string) string {
	return `"` + strings.ReplaceAll(path, `"`, `\"`) + `"`
}

func refreshDesktopIntegration(home string) {
	commands := [][]string{
		{"update-mime-database", filepath.Join(home, ".local", "share", "mime")},
		{"update-desktop-database", filepath.Join(home, ".local", "share", "applications")},
		{"gtk-update-icon-cache", "-f", "-t", "-q", filepath.Join(home, ".local", "share", "icons", "hicolor")},
		{"xdg-icon-resource", "forceupdate", "--theme", "hicolor"},
		{"xdg-desktop-menu", "forceupdate"},
	}
	for _, command := range commands {
		if _, err := exec.LookPath(command[0]); err != nil {
			continue
		}
		_ = exec.Command(command[0], command[1:]...).Run()
	}
}

func setDefaultMarkdownApp() {
	desktopID := "dkst-markdown-browser.desktop"
	mimeTypes := []string{
		"text/markdown",
		"text/x-markdown",
		"application/x-markdown",
		"application/x-extension-md",
		"application/x-extension-markdown",
	}
	if _, err := exec.LookPath("xdg-mime"); err != nil {
		return
	}
	for _, mimeType := range mimeTypes {
		_ = exec.Command("xdg-mime", "default", desktopID, mimeType).Run()
	}
}
