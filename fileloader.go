/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
)

type FileLoader struct {
	http.Handler
}

func NewFileLoader() *FileLoader {
	return &FileLoader{}
}

func (h *FileLoader) ServeHTTP(res http.ResponseWriter, req *http.Request) {
	requestedFilename := strings.TrimPrefix(req.URL.Path, "/")

	// If the path starts with "localfile/", we treat it as a direct disk path
	if strings.HasPrefix(requestedFilename, "localfile/") {
		filePath := strings.TrimPrefix(requestedFilename, "localfile/")
		if decodedPath, err := url.PathUnescape(filePath); err == nil {
			filePath = decodedPath
		}

		if !strings.HasPrefix(filePath, "/") && !strings.Contains(filePath, ":") {
			filePath = "/" + filePath
		}

		filePath = filepath.Clean(filepath.FromSlash(filePath))
		http.ServeFile(res, req, filePath)
		return
	}

	res.WriteHeader(http.StatusNotFound)
}
