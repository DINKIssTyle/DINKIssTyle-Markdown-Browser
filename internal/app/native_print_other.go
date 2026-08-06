//go:build !darwin && !ios

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import "github.com/wailsapp/wails/v3/pkg/application"

func showPageSetup(_ *application.WebviewWindow) {
}

func printCurrentWindow(window *application.WebviewWindow) {
	if window != nil {
		_ = window.Print()
	}
}
