//go:build darwin

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework Cocoa -framework WebKit
#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface WailsContext : NSObject
@property (retain) NSWindow* mainWindow;
@property (retain) WKWebView* webview;
@end

static void DKSTShowPageSetup(void *inctx) {
    dispatch_async(dispatch_get_main_queue(), ^{
        WailsContext *ctx = (__bridge WailsContext*) inctx;
        if (ctx == nil || ctx.mainWindow == nil) {
            return;
        }

        NSPageLayout *pageLayout = [NSPageLayout pageLayout];
        NSPrintInfo *printInfo = [NSPrintInfo sharedPrintInfo];

        [pageLayout beginSheetWithPrintInfo:printInfo
                             modalForWindow:ctx.mainWindow
                                   delegate:nil
                             didEndSelector:nil
                                contextInfo:nil];
    });
}

static void DKSTPrintCurrentWindow(void *inctx) {
    dispatch_async(dispatch_get_main_queue(), ^{
        WailsContext *ctx = (__bridge WailsContext*) inctx;
        if (ctx == nil || ctx.webview == nil || ctx.mainWindow == nil) {
            return;
        }

        WKWebView *webView = ctx.webview;
        NSPrintInfo *printInfo = [[NSPrintInfo sharedPrintInfo] copy];
        printInfo.horizontalPagination = NSPrintingPaginationModeAutomatic;
        printInfo.verticalPagination = NSPrintingPaginationModeAutomatic;
        printInfo.verticallyCentered = NO;
        printInfo.horizontallyCentered = NO;

        NSPrintOperation *operation = [webView printOperationWithPrintInfo:printInfo];
        operation.showsPrintPanel = YES;
        operation.showsProgressPanel = YES;
        operation.view.frame = webView.bounds;

        [operation runOperationModalForWindow:ctx.mainWindow
                                     delegate:ctx.mainWindow.delegate
                               didRunSelector:nil
                                  contextInfo:nil];
    });
}
*/
import "C"

import (
	"context"
	"reflect"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func showPageSetup(ctx context.Context) {
	if ptr := wailsContextPointer(ctx); ptr != nil {
		C.DKSTShowPageSetup(ptr)
	}
}

func printCurrentWindow(ctx context.Context) {
	if ptr := wailsContextPointer(ctx); ptr != nil {
		C.DKSTPrintCurrentWindow(ptr)
		return
	}

	runtime.WindowPrint(ctx)
}

func wailsContextPointer(ctx context.Context) unsafe.Pointer {
	defer func() {
		_ = recover()
	}()

	if ctx == nil {
		return nil
	}

	return findWailsContextPointer(reflect.ValueOf(ctx.Value("frontend")), 0)
}

func findWailsContextPointer(value reflect.Value, depth int) unsafe.Pointer {
	if depth > 8 || !value.IsValid() {
		return nil
	}

	for value.Kind() == reflect.Interface || value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return nil
		}
		value = value.Elem()
	}

	if value.Kind() != reflect.Struct {
		return nil
	}

	if mainWindow := value.FieldByName("mainWindow"); mainWindow.IsValid() {
		if ptr := windowContextPointer(mainWindow); ptr != nil {
			return ptr
		}
	}

	for i := 0; i < value.NumField(); i++ {
		field := value.Field(i)
		if ptr := findWailsContextPointer(field, depth+1); ptr != nil {
			return ptr
		}
	}

	return nil
}

func windowContextPointer(value reflect.Value) unsafe.Pointer {
	for value.Kind() == reflect.Interface || value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return nil
		}
		value = value.Elem()
	}

	if value.Kind() != reflect.Struct {
		return nil
	}

	field := value.FieldByName("context")
	if !field.IsValid() || field.Kind() != reflect.UnsafePointer || !field.CanAddr() {
		return nil
	}

	return *(*unsafe.Pointer)(unsafe.Pointer(field.UnsafeAddr()))
}
