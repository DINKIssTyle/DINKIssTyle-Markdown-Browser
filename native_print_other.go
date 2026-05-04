//go:build !darwin

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func showPageSetup(_ context.Context) {
}

func printCurrentWindow(ctx context.Context) {
	runtime.WindowPrint(ctx)
}
