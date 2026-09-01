/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"embed"
	"log"
	"runtime"

	appcore "dinkisstyle-markdown-browser/internal/app"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIconDarwinPNG []byte

//go:embed build/appicon_winlin.png
var appIconOtherPNG []byte

//go:embed build/markdown-doc.png
var documentIconPNG []byte

func getAppIconPNG() []byte {
	if runtime.GOOS == "darwin" {
		return appIconDarwinPNG
	}
	return appIconOtherPNG
}

func main() {
	appIcon := getAppIconPNG()
	// appicon.png is the full-bleed source used to generate Apple's icon
	// assets. Dialogs need the already-shaped cross-platform artwork so the
	// source graphic is not shown as a square on macOS.
	appcore.SetIntegrationIcons(appIconOtherPNG, documentIconPNG)
	service := appcore.NewApp()
	appcore.RegisterIOSOpenFileHandler(service.HandleSystemOpenFile)
	appcore.RegisterAndroidOpenFileHandler(service.HandleSystemOpenFile)

	wailsApp := application.New(application.Options{
		Name:        appcore.AppName,
		Description: "An elegant cross-platform viewer for Markdown and HTML files.",
		Icon:        platformApplicationIcon(appIcon),
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
		FileAssociations:            []string{".md", ".markdown", ".html", ".htm"},
		SingleInstance:              getSingleInstanceOptions(service),
		ShouldQuit:                  service.ShouldQuit,
		DisableDefaultSignalHandler: runtime.GOOS == "ios",
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
	window.OnWindowEvent(events.Common.WindowDidMove, func(_ *application.WindowEvent) {
		service.RememberWindowBounds()
	})
	window.OnWindowEvent(events.Common.WindowDidResize, func(_ *application.WindowEvent) {
		service.RememberWindowBounds()
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

func getSingleInstanceOptions(service *appcore.App) *application.SingleInstanceOptions {
	if runtime.GOOS == "ios" || runtime.GOOS == "android" {
		return nil
	}
	return &application.SingleInstanceOptions{
		UniqueID:               "com.dinkisstyle.mdbrowser",
		OnSecondInstanceLaunch: service.HandleSecondInstanceLaunch,
	}
}
