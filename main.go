/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"embed"
	"fmt"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create and configure the file loader
	fileLoader := NewFileLoader()

	// Build the platform-specific menu (macOS: native menu bar, others: nil)
	appMenu := buildAppMenu(app)

	// Create application with options
	err := wails.Run(&options.App{
		Title:     AppName,
		Width:     1200,
		Height:    800,
		MinWidth:  800,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: fileLoader,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 18, A: 1}, // Sleek dark
		OnStartup:        app.startup,
		OnBeforeClose:    app.onBeforeClose,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "com.dinkisstyle.mdbrowser",
			OnSecondInstanceLaunch: app.HandleSecondInstanceLaunch,
		},
		Bind: []interface{}{
			app,
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		// macOS native menu bar
		Menu: appMenu,
		// macOS-specific window chrome
		// TitleBarDefault: 표준 macOS 타이틀바를 유지 (최신 macOS 호환)
		// HiddenInset은 타이틀 없이 트래픽라이트만 남아 창 드래그가 불가능해짐
		Mac: &mac.Options{
			TitleBar:   mac.TitleBarDefault(),
			Appearance: mac.NSAppearanceNameAqua, // 시스템 라이트/다크 자동 따름
			About: &mac.AboutInfo{
				Title:   AppName,
				Message: fmt.Sprintf("Version %s\nCopyright (C) 2026 DINKI'ssTyle.\nAll rights reserved.", AppVersion),
			},
			OnFileOpen: app.HandleSystemOpenFile,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
