/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"embed"
	"fmt"
	"log"
	"runtime"

	appcore "dinkisstyle-markdown-browser/internal/app"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIconPNG []byte

//go:embed build/linux/icon/*.png
var linuxIconFS embed.FS

func main() {
	appcore.SetIntegrationIcons(appIconPNG, loadLinuxIcons())
	service := appcore.NewApp()

	wailsApp := application.New(application.Options{
		Name:        appcore.AppName,
		Description: "An elegant cross-platform viewer for Markdown and HTML files.",
		Icon:        platformApplicationIcon(appIconPNG),
		Services: []application.Service{
			application.NewService(service),
		},
		Assets: application.AssetOptions{
			Handler: application.ChainMiddleware(
				appcore.LocalFileMiddleware(),
			)(application.AssetFileServerFS(assets)),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		FileAssociations: []string{".md", ".markdown", ".html", ".htm"},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID:               "com.dinkisstyle.mdbrowser",
			OnSecondInstanceLaunch: service.HandleSecondInstanceLaunch,
		},
		ShouldQuit: service.ShouldQuit,
	})

	window := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            appcore.AppName,
		Width:            1200,
		Height:           800,
		MinWidth:         800,
		MinHeight:        600,
		BackgroundColour: application.NewRGB(18, 18, 18),
		URL:              "/",
		EnableFileDrop:   true,
		Mac: application.MacWindow{
			TitleBar:   application.MacTitleBarDefault,
			Appearance: application.NSAppearanceNameAqua,
		},
	})

	service.AttachRuntime(wailsApp, window)
	if menu := service.BuildAppMenu(); menu != nil {
		wailsApp.Menu.Set(menu)
	}
	wailsApp.Event.OnApplicationEvent(events.Common.ApplicationOpenedWithFile, func(event *application.ApplicationEvent) {
		service.HandleSystemOpenFile(event.Context().Filename())
	})
	window.OnWindowEvent(events.Common.WindowRuntimeReady, func(_ *application.WindowEvent) {
		service.DomReady()
	})
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if service.HandleWindowClosing() {
			event.Cancel()
		}
	})
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		details := event.Context().DropTargetDetails()
		x, y := 0, 0
		if details != nil {
			x, y = details.X, details.Y
		}
		wailsApp.Event.Emit("wails:file-drop", map[string]any{
			"x": x, "y": y, "files": event.Context().DroppedFiles(),
		})
	})

	service.Startup()
	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}

// macOS reads the application icon from the signed app bundle. Passing the raw
// PNG to Wails would call NSApp.setApplicationIconImage at runtime and replace
// the correctly sized ICNS/asset-catalog icon with the full-bleed source image.
func platformApplicationIcon(icon []byte) []byte {
	if runtime.GOOS == "darwin" {
		return nil
	}
	return icon
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
