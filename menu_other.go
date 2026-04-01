/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

//go:build windows || linux

package main

import "github.com/wailsapp/wails/v2/pkg/menu"

// buildAppMenu returns nil on Windows/Linux so Wails uses its default behaviour.
// (Wails v2 does not render a native menu bar on Windows/Linux; menus are
// handled by the frontend if desired.)
func buildAppMenu(_ *App) *menu.Menu {
	return nil
}
