/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import (
	"path/filepath"
	"strings"
)

// isEphemeralIOSIncomingDocument returns true only for files inside directories
// owned by this app that iOS may clean up: the app temporary directory and its
// Documents/Inbox import directory.
func isEphemeralIOSIncomingDocument(path, tempDir, docsDir string) bool {
	return isPathInsideDir(tempDir, path) || isPathInsideDir(filepath.Join(docsDir, "Inbox"), path)
}

func isPathInsideDir(parent, target string) bool {
	if parent == "" || target == "" {
		return false
	}
	rel, err := filepath.Rel(filepath.Clean(parent), filepath.Clean(target))
	return err == nil && rel != "." && rel != ".." && !filepath.IsAbs(rel) &&
		!strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// previousIOSContainerDocumentRelativePath recognizes the standard iOS data
// container layout and returns the path below Documents. External file-provider
// paths, including iCloud's Mobile Documents hierarchy, are deliberately rejected.
func previousIOSContainerDocumentRelativePath(path string) (string, bool) {
	const marker = "/Containers/Data/Application/"
	cleanPath := filepath.ToSlash(filepath.Clean(path))
	markerIndex := strings.LastIndex(cleanPath, marker)
	if markerIndex < 0 {
		return "", false
	}

	remainder := cleanPath[markerIndex+len(marker):]
	parts := strings.SplitN(remainder, "/", 3)
	if len(parts) != 3 || !looksLikeUUID(parts[0]) || parts[1] != "Documents" {
		return "", false
	}

	relativePath := filepath.ToSlash(filepath.Clean(filepath.FromSlash(parts[2])))
	if relativePath == "." || relativePath == ".." || strings.HasPrefix(relativePath, "../") {
		return "", false
	}
	return relativePath, true
}

func looksLikeUUID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for index, char := range value {
		switch index {
		case 8, 13, 18, 23:
			if char != '-' {
				return false
			}
		default:
			if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')) {
				return false
			}
		}
	}
	return true
}
