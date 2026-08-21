//go:build ios

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
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

// persistIncomingDocument copies app-owned imports from tmp/Inbox into
// ~/Documents. Paths outside the app container (including iCloud Drive and
// third-party file providers) are opened in place and must never be moved or
// silently replaced with a local copy.
func persistIncomingDocument(sourcePath string) string {
	cleanSource := filepath.Clean(sourcePath)
	if cleanSource == "" {
		return cleanSource
	}

	docsDir := ensurePublicDocumentsDirectory()
	if docsDir == "" {
		return cleanSource
	}

	if !isEphemeralIOSIncomingDocument(cleanSource, os.TempDir(), docsDir) {
		return cleanSource
	}

	// Check if the source file exists
	info, err := os.Stat(cleanSource)
	if err != nil || info.IsDir() {
		return cleanSource
	}

	fileName := filepath.Base(cleanSource)
	destPath, err := copyImportedDocument(cleanSource, docsDir, fileName, info.Mode().Perm())
	if err == nil {
		log.Printf("ios-documents: copied incoming file %s -> %s", cleanSource, destPath)
		return destPath
	}
	log.Printf("ios-documents: failed to preserve imported file path=%s err=%v", cleanSource, err)

	return cleanSource
}

// resolvePersistedDocumentPath recovers a valid current container path only for
// app Documents paths saved with an old iOS data-container UUID.
func resolvePersistedDocumentPath(savedPath string) string {
	cleanPath := filepath.Clean(savedPath)
	if cleanPath == "" {
		return cleanPath
	}

	// Existing open-in-place URLs must remain unchanged.
	if _, err := os.Stat(cleanPath); err == nil {
		return cleanPath
	}

	docsDir := ensurePublicDocumentsDirectory()
	if docsDir == "" {
		return cleanPath
	}

	// iOS may change the app data-container UUID. Recover only paths that can
	// be proven to refer to a previous app container's Documents directory;
	// never redirect an unavailable external URL merely by matching its name.
	relativePath, ok := previousIOSContainerDocumentRelativePath(cleanPath)
	if !ok {
		return cleanPath
	}
	candidate := filepath.Join(docsDir, filepath.FromSlash(relativePath))
	if _, err := os.Stat(candidate); err == nil {
		log.Printf("ios-documents: recovered old path %s -> %s", cleanPath, candidate)
		return candidate
	}

	return cleanPath
}

func copyImportedDocument(sourcePath, docsDir, fileName string, mode os.FileMode) (string, error) {
	if mode == 0 {
		mode = 0644
	}
	mode |= 0200

	for attempt := 1; attempt < 1000; attempt++ {
		destPath := filepath.Join(docsDir, fileName)
		if attempt > 1 {
			ext := filepath.Ext(fileName)
			base := fileName[:len(fileName)-len(ext)]
			destPath = filepath.Join(docsDir, fmt.Sprintf("%s %d%s", base, attempt, ext))
		}

		output, err := os.OpenFile(destPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
		if os.IsExist(err) {
			continue
		}
		if err != nil {
			return "", err
		}

		input, openErr := os.Open(sourcePath)
		if openErr != nil {
			_ = output.Close()
			_ = os.Remove(destPath)
			return "", openErr
		}
		_, copyErr := io.Copy(output, input)
		closeInputErr := input.Close()
		syncErr := output.Sync()
		closeOutputErr := output.Close()
		for _, operationErr := range []error{copyErr, closeInputErr, syncErr, closeOutputErr} {
			if operationErr != nil {
				_ = os.Remove(destPath)
				return "", operationErr
			}
		}
		return destPath, nil
	}

	return "", fmt.Errorf("unable to allocate a destination for %q", fileName)
}
