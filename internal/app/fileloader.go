/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import (
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
)

type FileLoader struct {
	http.Handler
}

// LocalFileMiddleware preserves the v2 /localfile bridge while delegating all
// application assets and Wails runtime requests to the v3 asset server.
func LocalFileMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		loader := NewFileLoader()
		return http.HandlerFunc(func(res http.ResponseWriter, req *http.Request) {
			if strings.HasPrefix(strings.TrimPrefix(req.URL.Path, "/"), "localfile/") {
				loader.ServeHTTP(res, req)
				return
			}
			next.ServeHTTP(res, req)
		})
	}
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
