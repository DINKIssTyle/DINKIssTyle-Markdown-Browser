//go:build darwin && !ios

package app

import "github.com/wailsapp/wails/v3/pkg/application"

// BuildAppMenu constructs the native macOS menu using the Wails 3 menu API.
//wails:ignore
func (a *App) BuildAppMenu() *application.Menu {
	menu := a.wailsApp.NewMenu()
	menu.AddRole(application.AppMenu)

	file := menu.AddSubmenu("File")
	a.addMenuEvent(file, "Ask AI", "CmdOrCtrl+/", "menu:ask-ai", false)
	file.AddSeparator()
	a.addMenuEvent(file, "New Tab", "CmdOrCtrl+T", "menu:new-window", true)
	a.addMenuEvent(file, "Reopen Closed Tab", "CmdOrCtrl+Shift+T", "menu:reopen-closed-tab", true)
	a.addMenuEvent(file, "New Document", "CmdOrCtrl+N", "menu:new-document", true)
	file.AddSeparator()
	a.addMenuEvent(file, "Open...", "CmdOrCtrl+O", "menu:open-file", false)
	a.addMenuEvent(file, "Save", "CmdOrCtrl+S", "menu:save", false)
	a.addMenuEvent(file, "Save As...", "CmdOrCtrl+Shift+S", "menu:save-as", false)
	file.AddSeparator()
	a.addMenuEvent(file, "Page Setup...", "CmdOrCtrl+Shift+P", "menu:page-setup", false)
	a.addMenuEvent(file, "Print...", "CmdOrCtrl+P", "menu:print", false)
	file.AddSeparator()
	file.AddRole(application.Quit)

	menu.AddRole(application.EditMenu)

	view := menu.AddSubmenu("View")
	a.addMenuEvent(view, "Home", "CmdOrCtrl+Shift+H", "menu:home", false)
	view.AddSeparator()
	a.addMenuEvent(view, "Back", "CmdOrCtrl+[", "menu:back", false)
	a.addMenuEvent(view, "Forward", "CmdOrCtrl+]", "menu:forward", false)
	view.AddSeparator()
	a.addMenuEvent(view, "Refresh", "CmdOrCtrl+R", "menu:refresh", false)
	view.AddSeparator()
	a.addMenuEvent(view, "Toggle Sidebar", "Alt+S", "menu:toggle-sidebar", false)
	a.addMenuEvent(view, "Toggle File Tree Sidebar", "Alt+1", "menu:toggle-files-sidebar", false)
	a.addMenuEvent(view, "Toggle Outline Sidebar", "Alt+2", "menu:toggle-outline-sidebar", false)
	a.addMenuEvent(view, "Toggle Search Sidebar", "Alt+3", "menu:toggle-search-sidebar", false)
	a.addMenuEvent(view, "Toggle Search Panel", "CmdOrCtrl+F", "menu:toggle-search", false)
	a.addMenuEvent(view, "Toggle Editor Preview", "CmdOrCtrl+G", "menu:toggle-editor-preview", false)
	view.AddSeparator()
	a.addMenuEvent(view, "Actual Size", "CmdOrCtrl+0", "menu:font-reset", false)
	a.addMenuEvent(view, "Zoom In", "CmdOrCtrl+=", "menu:font-up", false)
	a.addMenuEvent(view, "Zoom Out", "CmdOrCtrl+-", "menu:font-down", false)
	view.AddSeparator()
	a.addMenuEvent(view, "Toggle Theme", "CmdOrCtrl+K", "menu:toggle-theme", false)

	menu.AddRole(application.WindowMenu)
	help := menu.AddSubmenu("Help")
	help.Add("DKST Markdown Browser Help").OnClick(func(_ *application.Context) {
		a.wailsApp.Dialog.Info().AttachToWindow(a.window).SetTitle("Help").SetMessage(
			"• New Document: ⌘N\n• New Tab: ⌘T\n• Open File: ⌘O or 📂 button\n• Home: ⇧⌘H or ⌂ button\n• Refresh: ⌘R or ↻ button\n• Search: ⌘F or 🔍 button\n• Toggle Theme: ⌘K or 🌓 button\n• History: ⌘[ / ⌘] or ← → buttons\n• Font Size: ⌘+/⌘-",
		).Show()
	})
	return menu
}

func (a *App) addMenuEvent(menu *application.Menu, label, accelerator, event string, showWindow bool) {
	item := menu.Add(label)
	if accelerator != "" {
		item.SetAccelerator(accelerator)
	}
	item.OnClick(func(_ *application.Context) {
		if showWindow {
			a.showMainWindow()
		}
		a.emit(event)
	})
}
