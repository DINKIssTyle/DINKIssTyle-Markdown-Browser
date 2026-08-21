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

// ensurePublicDocumentsDirectory ensures an accessible documents directory exists
// and contains a starter welcome document if empty.
func ensurePublicDocumentsDirectory() string {
	candidates := []string{
		"/storage/emulated/0/Documents/DKST Markdown Browser",
		"/sdcard/Documents/DKST Markdown Browser",
		"/storage/emulated/0/Android/data/com.dinkisstyle.mdbrowser/files/Documents/DKST Markdown Browser",
		"/storage/emulated/0/Android/data/com.dinkisstyle.mdbrowser/files/Documents",
	}

	if home, err := os.UserHomeDir(); err == nil && home != "" {
		candidates = append(candidates,
			filepath.Join(home, "files", "Documents", "DKST Markdown Browser"),
			filepath.Join(home, "files", "Documents"),
			filepath.Join(home, "Documents", "DKST Markdown Browser"),
			filepath.Join(home, "Documents"),
		)
	}
	candidates = append(candidates,
		"/data/user/0/com.dinkisstyle.mdbrowser/files/Documents/DKST Markdown Browser",
		"/data/user/0/com.dinkisstyle.mdbrowser/files/Documents",
		"/data/data/com.dinkisstyle.mdbrowser/files/Documents/DKST Markdown Browser",
		"/data/data/com.dinkisstyle.mdbrowser/files/Documents",
	)

	var docsDir string
	for _, cand := range candidates {
		if err := os.MkdirAll(cand, 0755); err == nil {
			// Verify write and read permission
			testFile := filepath.Join(cand, ".dkst_write_test")
			if writeErr := os.WriteFile(testFile, []byte("ok"), 0644); writeErr == nil {
				if readData, readErr := os.ReadFile(testFile); readErr == nil && string(readData) == "ok" {
					_ = os.Remove(testFile)
					docsDir = cand
					break
				}
				_ = os.Remove(testFile)
			}
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

This is your Documents folder (` + docsDir + `).
Any Markdown (.md) or HTML (.html) files saved here can be easily accessed, managed, and edited.

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

func isReadableFile(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	_ = f.Close()
	return true
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
		if isReadableFile(candidate) {
			return candidate
		}
		return cleanSource
	}

	fileName := filepath.Base(cleanSource)
	destPath := filepath.Join(docsDir, fileName)

	// Copy the file into Documents directory keeping its exact filename
	if err := copyFile(cleanSource, destPath, info.Mode().Perm()); err == nil {
		if isReadableFile(destPath) {
			log.Printf("android-documents: persisted incoming file %s -> %s", cleanSource, destPath)
			return destPath
		}
	}

	// Fallback to cleanSource if it is already readable
	if isReadableFile(cleanSource) {
		return cleanSource
	}

	return cleanSource
}

func resolvePersistedDocumentPath(savedPath string) string {
	cleanPath := filepath.Clean(savedPath)
	if cleanPath == "" {
		return cleanPath
	}

	if isReadableFile(cleanPath) {
		return cleanPath
	}

	docsDir := ensurePublicDocumentsDirectory()
	if docsDir == "" {
		return cleanPath
	}

	baseName := filepath.Base(cleanPath)
	candidate := filepath.Join(docsDir, baseName)
	if isReadableFile(candidate) {
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
