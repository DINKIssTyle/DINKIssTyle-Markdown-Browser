/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"embed"
	"fmt"

	appcore "dinkisstyle-markdown-browser/internal/app"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIconPNG []byte

//go:embed build/linux/icon/*.png
var linuxIconFS embed.FS

func main() {
	appcore.SetIntegrationIcons(appIconPNG, loadLinuxIcons())

	// Create an instance of the app structure
	app := appcore.NewApp()

	// Create and configure the file loader
	fileLoader := appcore.NewFileLoader()

	// Build the platform-specific menu (macOS: native menu bar, others: nil)
	appMenu := appcore.BuildAppMenu(app)

	// Create application with options
	err := wails.Run(&options.App{
		Title:     appcore.AppName,
		Width:     1200,
		Height:    800,
		MinWidth:  800,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: fileLoader,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 18, A: 1}, // Sleek dark
		OnStartup:        app.Startup,
		OnDomReady:       app.DomReady,
		OnBeforeClose:    app.OnBeforeClose,
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
				Title:   appcore.AppName,
				Message: fmt.Sprintf("Version %s\nCopyright (C) 2026 DINKI'ssTyle.\nAll rights reserved.", appcore.AppVersion),
			},
			OnFileOpen: app.HandleSystemOpenFile,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

func loadLinuxIcons() map[int][]byte {
	icons := map[int][]byte{}
	for _, size := range []int{16, 24, 32, 48, 64, 128, 256, 512, 1024} {
		icon, err := linuxIconFS.ReadFile(fmt.Sprintf("build/linux/icon/%d.png", size))
		if err == nil {
			icons[size] = icon
		}
	}
	return icons
}
