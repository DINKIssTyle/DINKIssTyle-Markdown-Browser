//go:build !darwin || ios

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import "github.com/wailsapp/wails/v3/pkg/application"

// BuildAppMenu returns nil on Windows/Linux so Wails uses its default behaviour.
// (Wails v2 does not render a native menu bar on Windows/Linux; menus are
// handled by the frontend if desired.)
//wails:ignore
func (a *App) BuildAppMenu() *application.Menu {
	return nil
}
