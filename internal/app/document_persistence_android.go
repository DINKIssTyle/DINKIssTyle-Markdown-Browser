//go:build android

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// ensurePublicDocumentsDirectory ensures the public /storage/emulated/0/Documents or app external documents directory exists
// and contains a starter welcome document if empty.
func ensurePublicDocumentsDirectory() string {
	candidates := []string{
		"/storage/emulated/0/Documents",
		"/sdcard/Documents",
		"/storage/emulated/0/Documents/DKST Markdown Browser",
		"/sdcard/Documents/DKST Markdown Browser",
		"/storage/emulated/0/Android/data/com.dinkisstyle.mdbrowser/files/Documents",
	}

	var docsDir string
	for _, cand := range candidates {
		if err := os.MkdirAll(cand, 0755); err == nil {
			// Verify write permission
			testFile := filepath.Join(cand, ".dkst_write_test")
			if writeErr := os.WriteFile(testFile, []byte("ok"), 0644); writeErr == nil {
				_ = os.Remove(testFile)
				docsDir = cand
				break
			}
		}
	}

	if docsDir == "" {
		home, err := os.UserHomeDir()
		if err == nil && home != "" {
			fallback := filepath.Join(home, "Documents")
			_ = os.MkdirAll(fallback, 0755)
			docsDir = fallback
		}
	}

	if docsDir == "" {
		return ""
	}

	// If Documents directory is currently empty, create a starter document
	entries, err := os.ReadDir(docsDir)
	if err == nil && len(entries) == 0 {
		welcomePath := filepath.Join(docsDir, "Welcome.md")
		welcomeContent := `# Welcome to DKST Markdown Browser

This is your public Documents folder (` + docsDir + `).
Any Markdown (.md) or HTML (.html) files saved here can be easily accessed, managed, and edited from Android file managers (Samsung My Files, Google Files, etc.) or PC via USB.

## Features
- **Fast Markdown Rendering**: Supports GitHub Flavored Markdown, Math/LaTeX, Mermaid diagrams, and code highlighting.
- **Side-by-side Editor & Preview**: Edit with instant live preview.
- **AI Assistant**: Built-in AI editing, proofreading, and translation tools.
- **Multi-tab Browser**: Work with multiple documents simultaneously.
`
		_ = os.WriteFile(welcomePath, []byte(welcomeContent), 0644)
		log.Printf("android-documents: created starter document at %s", welcomePath)
	}

	return docsDir
}

// persistIncomingDocument ensures any document opened from cache/download/temp is saved into Documents
func persistIncomingDocument(sourcePath string) string {
	cleanSource := filepath.Clean(sourcePath)
	if cleanSource == "" {
		return cleanSource
	}

	docsDir := ensurePublicDocumentsDirectory()
	if docsDir == "" {
		return cleanSource
	}

	if isInsideDir(docsDir, cleanSource) {
		return cleanSource
	}

	info, err := os.Stat(cleanSource)
	if err != nil || info.IsDir() {
		candidate := filepath.Join(docsDir, filepath.Base(cleanSource))
		if _, statErr := os.Stat(candidate); statErr == nil {
			return candidate
		}
		return cleanSource
	}

	fileName := filepath.Base(cleanSource)
	destPath := filepath.Join(docsDir, fileName)

	if destInfo, statErr := os.Stat(destPath); statErr == nil {
		if destInfo.Size() == info.Size() {
			return destPath
		}
		destPath = findAvailablePath(docsDir, fileName)
	}

	if err := os.Rename(cleanSource, destPath); err == nil {
		log.Printf("android-documents: moved incoming file %s -> %s", cleanSource, destPath)
		return destPath
	}

	if err := copyFile(cleanSource, destPath, info.Mode().Perm()); err == nil {
		log.Printf("android-documents: copied incoming file %s -> %s", cleanSource, destPath)
		return destPath
	}

	return cleanSource
}

func resolvePersistedDocumentPath(savedPath string) string {
	cleanPath := filepath.Clean(savedPath)
	if cleanPath == "" {
		return cleanPath
	}

	if _, err := os.Stat(cleanPath); err == nil {
		return cleanPath
	}

	docsDir := ensurePublicDocumentsDirectory()
	if docsDir == "" {
		return cleanPath
	}

	baseName := filepath.Base(cleanPath)
	candidate := filepath.Join(docsDir, baseName)
	if _, err := os.Stat(candidate); err == nil {
		log.Printf("android-documents: recovered path %s -> %s", cleanPath, candidate)
		return candidate
	}

	return cleanPath
}

func isInsideDir(parent, target string) bool {
	rel, err := filepath.Rel(parent, target)
	return err == nil && rel != "." && !filepath.IsAbs(rel) && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func findAvailablePath(directory, fileName string) string {
	ext := filepath.Ext(fileName)
	base := strings.TrimSuffix(fileName, ext)
	for i := 2; i < 1000; i++ {
		candidate := filepath.Join(directory, fmt.Sprintf("%s %d%s", base, i, ext))
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
	return filepath.Join(directory, fileName)
}
