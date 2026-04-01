/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
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
		// On Windows, the path might need adjustment if it has a drive letter
		// For macOS/Linux, it should be an absolute path
		if !strings.HasPrefix(filePath, "/") && !strings.Contains(filePath, ":") {
			filePath = "/" + filePath
		}
		
		fileData, err := ioutil.ReadFile(filePath)
		if err != nil {
			res.WriteHeader(http.StatusNotFound)
			res.Write([]byte(fmt.Sprintf("Could not load file %s", filePath)))
			return
		}
		res.Write(fileData)
		return
	}

	res.WriteHeader(http.StatusNotFound)
}
