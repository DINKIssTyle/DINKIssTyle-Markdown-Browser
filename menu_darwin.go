//go:build darwin

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// buildAppMenu constructs the macOS native menu bar.
// Wails v2 on macOS replaces the built-in menu with the one returned here.
func buildAppMenu(app *App) *menu.Menu {
	appMenu := menu.NewMenuFromItems(menu.AppMenu())

	// ── File menu ──────────────────────────────────────────────────────
	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("New Window", keys.CmdOrCtrl("n"), func(_ *menu.CallbackData) {
		runtime.Show(app.ctx)
		runtime.WindowShow(app.ctx)
		runtime.WindowUnminimise(app.ctx)
		runtime.EventsEmit(app.ctx, "menu:new-window")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Open...", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		// 프론트엔드의 OpenFile 트리거 — 이벤트로 알린다
		runtime.EventsEmit(app.ctx, "menu:open-file")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		runtime.Quit(app.ctx)
	})

	// editMenu.AddText("Select All", keys.CmdOrCtrl("a"), nil)

	// ── View menu ──────────────────────────────────────────────────────
	viewMenu := appMenu.AddSubmenu("View")
	viewMenu.AddText("Home", keys.Combo("h", keys.CmdOrCtrlKey, keys.ShiftKey), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:home")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Back", keys.CmdOrCtrl("["), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:back")
	})
	viewMenu.AddText("Forward", keys.CmdOrCtrl("]"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:forward")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Refresh", keys.CmdOrCtrl("r"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:refresh")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Toggle Search Panel", keys.CmdOrCtrl("f"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:toggle-search")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Actual Size", keys.CmdOrCtrl("0"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:font-reset")
	})
	viewMenu.AddText("Zoom In", keys.CmdOrCtrl("="), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:font-up")
	})
	viewMenu.AddText("Zoom Out", keys.CmdOrCtrl("-"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:font-down")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Toggle Theme", keys.CmdOrCtrl("t"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:toggle-theme")
	})

	appMenu.Append(menu.WindowMenu())

	// ── Help menu ──────────────────────────────────────────────────────
	helpMenu := appMenu.AddSubmenu("Help")
	helpMenu.AddText("DKST Markdown Browser Help", nil, func(_ *menu.CallbackData) {
		runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{
			Type:    runtime.InfoDialog,
			Title:   "Help",
			Message: "• Open File: ⌘O or 📂 button\n• Home: ⇧⌘H or ⌂ button\n• Refresh: ⌘R or ↻ button\n• Search: ⌘F or 🔍 button\n• Toggle Theme: ⌘T or 🌓 button\n• History: ⌘[ / ⌘] or ← → buttons\n• Font Size: ⌘+/⌘-",
		})
	})

	return appMenu
}
