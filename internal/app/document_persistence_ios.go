//go:build ios

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

// ensurePublicDocumentsDirectory ensures the public ~/Documents directory exists
// and contains a starter welcome document if empty, so the iOS Files app
// ("나의 iPad / 나의 iPhone") immediately indexes and shows "DKST Markdown Browser".
func ensurePublicDocumentsDirectory() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	docsDir := filepath.Join(home, "Documents")
	if err := os.MkdirAll(docsDir, 0755); err != nil {
		log.Printf("ios-documents: MkdirAll failed path=%s err=%v", docsDir, err)
		return ""
	}

	// If Documents directory is currently empty, create a starter document so Files app displays the folder icon
	entries, err := os.ReadDir(docsDir)
	if err == nil && len(entries) == 0 {
		welcomePath := filepath.Join(docsDir, "Welcome.md")
		welcomeContent := `# Welcome to DKST Markdown Browser

This is your public Documents folder. Any Markdown (.md) or HTML (.html) files saved here can be easily accessed, managed, and edited from the iOS Files app or Mac Finder.

## Features
- **Fast Markdown Rendering**: Supports GitHub Flavored Markdown, Math/LaTeX, Mermaid diagrams, and code highlighting.
- **Side-by-side Editor & Preview**: Edit with instant live preview.
- **AI Assistant**: Built-in AI editing, proofreading, and translation tools.
- **Multi-tab Browser**: Work with multiple documents simultaneously.
`
		_ = os.WriteFile(welcomePath, []byte(welcomeContent), 0644)
		log.Printf("ios-documents: created starter document at %s", welcomePath)
	}

	return docsDir
}

// persistIncomingDocument ensures any document opened from an ephemeral location
// (like tmp/ or ...-Inbox/) is copied or moved into ~/Documents so it persists
// across app container UUID rotations and iOS tmp cleanups.
func persistIncomingDocument(sourcePath string) string {
	cleanSource := filepath.Clean(sourcePath)
	if cleanSource == "" {
		return cleanSource
	}

	docsDir := ensurePublicDocumentsDirectory()
	if docsDir == "" {
		return cleanSource
	}

	// If it is already inside ~/Documents, keep as is
	if isInsideDir(docsDir, cleanSource) {
		return cleanSource
	}

	// Check if the source file exists
	info, err := os.Stat(cleanSource)
	if err != nil || info.IsDir() {
		// If source doesn't exist, try resolving candidate in ~/Documents
		candidate := filepath.Join(docsDir, filepath.Base(cleanSource))
		if _, statErr := os.Stat(candidate); statErr == nil {
			return candidate
		}
		return cleanSource
	}

	fileName := filepath.Base(cleanSource)
	destPath := filepath.Join(docsDir, fileName)

	// If destination already exists with same size, return it
	if destInfo, statErr := os.Stat(destPath); statErr == nil {
		if destInfo.Size() == info.Size() {
			return destPath
		}
		// Generate unique destination filename if different
		destPath = findAvailablePath(docsDir, fileName)
	}

	// Try moving (rename), or copy fallback
	if err := os.Rename(cleanSource, destPath); err == nil {
		log.Printf("ios-documents: moved incoming file %s -> %s", cleanSource, destPath)
		return destPath
	}

	if err := copyFile(cleanSource, destPath, info.Mode().Perm()); err == nil {
		log.Printf("ios-documents: copied incoming file %s -> %s", cleanSource, destPath)
		return destPath
	}

	return cleanSource
}

// resolvePersistedDocumentPath recovers a valid current container path for paths
// saved with an old container UUID or from tmp/com.dinkisstyle.mdbrowser-Inbox/
func resolvePersistedDocumentPath(savedPath string) string {
	cleanPath := filepath.Clean(savedPath)
	if cleanPath == "" {
		return cleanPath
	}

	// If currently accessible at saved path, persist if in tmp
	if _, err := os.Stat(cleanPath); err == nil {
		if strings.Contains(cleanPath, "/tmp/") || strings.Contains(cleanPath, "-Inbox") {
			return persistIncomingDocument(cleanPath)
		}
		return cleanPath
	}

	docsDir := ensurePublicDocumentsDirectory()
	if docsDir == "" {
		return cleanPath
	}

	// Try matching by filename in ~/Documents
	baseName := filepath.Base(cleanPath)
	candidate := filepath.Join(docsDir, baseName)
	if _, err := os.Stat(candidate); err == nil {
		log.Printf("ios-documents: recovered old path %s -> %s", cleanPath, candidate)
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
