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
	appMenu := menu.NewMenu()

	// ── Application menu (leftmost "Apple" menu on macOS) ──────────────
	appMenuItem := appMenu.AddSubmenu("DKST Markdown Browser")
	appMenuItem.AddText("About DKST Markdown Browser", nil, func(_ *menu.CallbackData) {
		runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{
			Type:    runtime.InfoDialog,
			Title:   "About DKST Markdown Browser",
			Message: "Version 1.0.0\n\nCopyright (C) 2026 DINKI'ssTyle.\nAll rights reserved.\n\nAn elegant cross-platform viewer for Markdown files.",
		})
	})
	appMenuItem.AddSeparator()
	appMenuItem.AddText("Hide", keys.CmdOrCtrl("h"), func(_ *menu.CallbackData) {
		runtime.WindowHide(app.ctx)
	})
	appMenuItem.AddSeparator()
	appMenuItem.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		runtime.Quit(app.ctx)
	})

	// ── File menu ──────────────────────────────────────────────────────
	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("Open...", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		// 프론트엔드의 OpenFile 트리거 — 이벤트로 알린다
		runtime.EventsEmit(app.ctx, "menu:open-file")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		runtime.Quit(app.ctx)
	})

	// ── Edit menu (기본 텍스트 편집 단축키 제공) ───────────────────────
	editMenu := appMenu.AddSubmenu("Edit")
	editMenu.AddText("Undo", keys.CmdOrCtrl("z"), nil)
	editMenu.AddSeparator()
	editMenu.AddText("Cut", keys.CmdOrCtrl("x"), nil)
	editMenu.AddText("Copy", keys.CmdOrCtrl("c"), nil)
	editMenu.AddText("Paste", keys.CmdOrCtrl("v"), nil)
	editMenu.AddText("Select All", keys.CmdOrCtrl("a"), nil)

	// ── View menu ──────────────────────────────────────────────────────
	viewMenu := appMenu.AddSubmenu("View")
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

	// ── Window menu ────────────────────────────────────────────────────
	windowMenu := appMenu.AddSubmenu("Window")
	windowMenu.AddText("Minimize", keys.CmdOrCtrl("m"), func(_ *menu.CallbackData) {
		runtime.WindowMinimise(app.ctx)
	})

	// ── Help menu ──────────────────────────────────────────────────────
	helpMenu := appMenu.AddSubmenu("Help")
	helpMenu.AddText("DKST Markdown Browser Help", nil, func(_ *menu.CallbackData) {
		runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{
			Type:    runtime.InfoDialog,
			Title:   "Help",
			Message: "• Open File: ⌘O or 📂 button\n• Search: ⌘F or 🔍 button\n• Toggle Theme: ⌘T or 🌓 button\n• History: ← → buttons\n• Font Size: ⌘+/⌘-",
		})
	})

	return appMenu
}
