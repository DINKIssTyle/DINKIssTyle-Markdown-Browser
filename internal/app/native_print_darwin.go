//go:build darwin && !ios

package app

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework Cocoa
#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>

static void DKSTShowPageSetup(void *nativeWindow) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = (__bridge NSWindow*) nativeWindow;
        if (window == nil) return;
        [[NSPageLayout pageLayout] beginSheetWithPrintInfo:[NSPrintInfo sharedPrintInfo]
                                           modalForWindow:window
                                                 delegate:nil
                                           didEndSelector:nil
                                              contextInfo:nil];
    });
}
*/
import "C"

import "github.com/wailsapp/wails/v3/pkg/application"

//wails:ignore
func showPageSetup(window *application.WebviewWindow) {
	if window != nil && window.NativeWindow() != nil {
		C.DKSTShowPageSetup(window.NativeWindow())
	}
}

//wails:ignore
func printCurrentWindow(window *application.WebviewWindow) {
	if window != nil {
		_ = window.Print()
	}
}
