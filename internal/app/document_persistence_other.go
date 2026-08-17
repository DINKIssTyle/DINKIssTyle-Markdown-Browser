//go:build !ios

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

func ensurePublicDocumentsDirectory() string {
	return ""
}

func persistIncomingDocument(sourcePath string) string {
	return sourcePath
}

func resolvePersistedDocumentPath(savedPath string) string {
	return savedPath
}
