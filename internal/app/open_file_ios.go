//go:build ios

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

/*
#include <stdlib.h>
*/
import "C"

import "sync"

var iosOpenFiles struct {
	sync.Mutex
	handler func(string)
	pending []string
}

// RegisterIOSOpenFileHandler connects UIKit document-open callbacks to the
// application's normal open-file queue. UIKit can deliver a URL before main()
// has finished constructing the Wails application, so early paths are retained
// until the handler is available.
func RegisterIOSOpenFileHandler(handler func(string)) {
	iosOpenFiles.Lock()
	iosOpenFiles.handler = handler
	pending := append([]string(nil), iosOpenFiles.pending...)
	iosOpenFiles.pending = nil
	iosOpenFiles.Unlock()

	for _, path := range pending {
		handler(path)
	}
}

// WailsIOSOpenFile is called by WailsSceneDelegate when iOS asks the app to
// open a document from Files, Finder file sharing, or another application.
//
//export WailsIOSOpenFile
func WailsIOSOpenFile(path *C.char) {
	if path == nil {
		return
	}

	value := C.GoString(path)
	if value == "" {
		return
	}

	iosOpenFiles.Lock()
	handler := iosOpenFiles.handler
	if handler == nil {
		iosOpenFiles.pending = append(iosOpenFiles.pending, value)
	}
	iosOpenFiles.Unlock()

	if handler != nil {
		handler(value)
	}
}
