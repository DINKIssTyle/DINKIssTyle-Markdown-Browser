/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import (
	"encoding/json"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	defaultWindowWidth  = 1200
	defaultWindowHeight = 800
	minimumWindowWidth  = 800
	minimumWindowHeight = 600
)

type windowState struct {
	X         int  `json:"x"`
	Y         int  `json:"y"`
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximised bool `json:"maximised"`
}

func (state windowState) bounds() application.Rect {
	return application.Rect{X: state.X, Y: state.Y, Width: state.Width, Height: state.Height}
}

func windowStateFromBounds(bounds application.Rect, maximised bool) windowState {
	return windowState{
		X:         bounds.X,
		Y:         bounds.Y,
		Width:     bounds.Width,
		Height:    bounds.Height,
		Maximised: maximised,
	}
}

func validWindowBounds(bounds application.Rect) bool {
	return bounds.Width > 0 && bounds.Height > 0
}

// RememberWindowBounds keeps the most recent non-maximised desktop bounds in
// memory. Maximising and fullscreen transitions also emit resize events, so
// those states must not replace the last usable normal window rectangle.
//
//wails:ignore
func (a *App) RememberWindowBounds() {
	if application.System.IsMobile() || a.window == nil {
		return
	}
	if a.window.IsMaximised() || a.window.IsMinimised() || a.window.IsFullscreen() {
		return
	}
	bounds := a.window.Bounds()
	if !validWindowBounds(bounds) {
		return
	}
	a.windowStateMu.Lock()
	a.lastNormalBounds = bounds
	a.windowStateMu.Unlock()
}

func (a *App) saveWindowState() {
	if application.System.IsMobile() || a.window == nil || a.windowStatePath == "" {
		return
	}
	if !a.GetSettings().RestoreWindowState {
		_ = os.Remove(a.windowStatePath)
		return
	}

	currentBounds := a.window.Bounds()
	windowAvailable := validWindowBounds(currentBounds)
	if windowAvailable && !a.window.IsMaximised() && !a.window.IsMinimised() && !a.window.IsFullscreen() {
		a.RememberWindowBounds()
	}
	a.windowStateMu.Lock()
	if windowAvailable {
		a.lastWindowMaximised = a.window.IsMaximised()
	}
	bounds := a.lastNormalBounds
	maximised := a.lastWindowMaximised
	a.windowStateMu.Unlock()
	if !validWindowBounds(bounds) {
		bounds = application.Rect{Width: defaultWindowWidth, Height: defaultWindowHeight}
	}

	data, err := json.Marshal(windowStateFromBounds(bounds, maximised))
	if err != nil {
		return
	}
	_ = os.WriteFile(a.windowStatePath, data, 0600)
}

func (a *App) restoreWindowState(screens []*application.Screen) bool {
	if application.System.IsMobile() || a.window == nil || a.windowStatePath == "" {
		return false
	}
	if !a.GetSettings().RestoreWindowState {
		return false
	}
	data, err := os.ReadFile(a.windowStatePath)
	if err != nil {
		return false
	}
	var saved windowState
	if json.Unmarshal(data, &saved) != nil {
		return false
	}
	bounds, ok := clampWindowBounds(saved.bounds(), screens, minimumWindowWidth, minimumWindowHeight)
	if !ok {
		return false
	}

	a.window.SetBounds(bounds)
	a.windowStateMu.Lock()
	a.lastNormalBounds = bounds
	a.lastWindowMaximised = saved.Maximised
	a.windowStateMu.Unlock()
	if saved.Maximised {
		a.window.Maximise()
	}
	return true
}

func clampWindowBounds(bounds application.Rect, screens []*application.Screen, minWidth, minHeight int) (application.Rect, bool) {
	if !validWindowBounds(bounds) {
		return application.Rect{}, false
	}

	var target application.Rect
	bestIntersection := 0
	for _, screen := range screens {
		workArea, ok := usableWorkArea(screen)
		if !ok {
			continue
		}
		intersection := rectangleIntersectionArea(bounds, workArea)
		if intersection > bestIntersection {
			bestIntersection = intersection
			target = workArea
		}
	}
	if bestIntersection == 0 {
		for _, screen := range screens {
			if screen == nil || !screen.IsPrimary {
				continue
			}
			if workArea, ok := usableWorkArea(screen); ok {
				target = workArea
				break
			}
		}
	}
	if !validWindowBounds(target) {
		for _, screen := range screens {
			if workArea, ok := usableWorkArea(screen); ok {
				target = workArea
				break
			}
		}
	}
	if !validWindowBounds(target) {
		return application.Rect{}, false
	}

	width := clampDimension(bounds.Width, minWidth, target.Width)
	height := clampDimension(bounds.Height, minHeight, target.Height)
	maxX := target.X + target.Width - width
	maxY := target.Y + target.Height - height
	return application.Rect{
		X:      clampInt(bounds.X, target.X, maxX),
		Y:      clampInt(bounds.Y, target.Y, maxY),
		Width:  width,
		Height: height,
	}, true
}

func usableWorkArea(screen *application.Screen) (application.Rect, bool) {
	if screen == nil {
		return application.Rect{}, false
	}
	if validWindowBounds(screen.WorkArea) {
		return screen.WorkArea, true
	}
	if validWindowBounds(screen.Bounds) {
		return screen.Bounds, true
	}
	fallback := application.Rect{X: screen.X, Y: screen.Y, Width: screen.Size.Width, Height: screen.Size.Height}
	return fallback, validWindowBounds(fallback)
}

func rectangleIntersectionArea(left, right application.Rect) int {
	width := minInt(left.X+left.Width, right.X+right.Width) - maxInt(left.X, right.X)
	height := minInt(left.Y+left.Height, right.Y+right.Height) - maxInt(left.Y, right.Y)
	if width <= 0 || height <= 0 {
		return 0
	}
	return width * height
}

func clampDimension(value, minimum, maximum int) int {
	if maximum <= 0 {
		return 0
	}
	if minimum > maximum {
		minimum = maximum
	}
	return clampInt(value, minimum, maximum)
}

func clampInt(value, minimum, maximum int) int {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func maxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}
