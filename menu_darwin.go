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
	fileMenu.AddText("Ask AI", keys.CmdOrCtrl("/"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:ask-ai")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("New Tab", keys.CmdOrCtrl("t"), func(_ *menu.CallbackData) {
		runtime.Show(app.ctx)
		runtime.WindowShow(app.ctx)
		runtime.WindowUnminimise(app.ctx)
		runtime.EventsEmit(app.ctx, "menu:new-window")
	})
	fileMenu.AddText("New Document", keys.CmdOrCtrl("n"), func(_ *menu.CallbackData) {
		runtime.Show(app.ctx)
		runtime.WindowShow(app.ctx)
		runtime.WindowUnminimise(app.ctx)
		runtime.EventsEmit(app.ctx, "menu:new-document")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Open...", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		// 프론트엔드의 OpenFile 트리거 — 이벤트로 알린다
		runtime.EventsEmit(app.ctx, "menu:open-file")
	})
	fileMenu.AddText("Save", keys.CmdOrCtrl("s"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:save")
	})
	fileMenu.AddText("Save As...", keys.Combo("s", keys.CmdOrCtrlKey, keys.ShiftKey), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:save-as")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Page Setup...", keys.Combo("p", keys.CmdOrCtrlKey, keys.ShiftKey), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:page-setup")
	})
	fileMenu.AddText("Print...", keys.CmdOrCtrl("p"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:print")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		runtime.Quit(app.ctx)
	})

	appMenu.Append(menu.EditMenu())

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
	viewMenu.AddText("Toggle Sidebar", keys.OptionOrAlt("s"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:toggle-sidebar")
	})
	viewMenu.AddText("Toggle File Tree Sidebar", keys.OptionOrAlt("1"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:toggle-files-sidebar")
	})
	viewMenu.AddText("Toggle Outline Sidebar", keys.OptionOrAlt("2"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:toggle-outline-sidebar")
	})
	viewMenu.AddText("Toggle Search Sidebar", keys.OptionOrAlt("3"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:toggle-search-sidebar")
	})
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
	viewMenu.AddText("Toggle Theme", keys.CmdOrCtrl("k"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:toggle-theme")
	})

	appMenu.Append(menu.WindowMenu())

	// ── Help menu ──────────────────────────────────────────────────────
	helpMenu := appMenu.AddSubmenu("Help")
	helpMenu.AddText("DKST Markdown Browser Help", nil, func(_ *menu.CallbackData) {
		runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{
			Type:    runtime.InfoDialog,
			Title:   "Help",
			Message: "• New Document: ⌘N\n• New Tab: ⌘T\n• Open File: ⌘O or 📂 button\n• Home: ⇧⌘H or ⌂ button\n• Refresh: ⌘R or ↻ button\n• Search: ⌘F or 🔍 button\n• Toggle Theme: ⌘K or 🌓 button\n• History: ⌘[ / ⌘] or ← → buttons\n• Font Size: ⌘+/⌘-",
		})
	})

	return appMenu
}
