//go:build darwin && !ios

package app

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework Cocoa -framework WebKit
#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static WKWebView* DKSTFindWKWebView(NSView *view) {
    if (view == nil) return nil;
    if ([view isKindOfClass:[WKWebView class]]) {
        return (WKWebView*)view;
    }
    for (NSView *subview in view.subviews) {
        WKWebView *found = DKSTFindWKWebView(subview);
        if (found != nil) return found;
    }
    return nil;
}

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

static void DKSTPrintCurrentWindow(void *nativeWindow) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = (__bridge NSWindow*) nativeWindow;
        if (window == nil) return;
        WKWebView *webView = DKSTFindWKWebView(window.contentView);
        if (webView != nil) {
            NSPrintInfo *printInfo = [NSPrintInfo sharedPrintInfo];
            NSPrintOperation *printOp = [webView printOperationWithPrintInfo:printInfo];
            if (printOp != nil) {
                NSPrintPanel *printPanel = [printOp printPanel];
                if (printPanel != nil) {
                    NSPrintPanelOptions options = [printPanel options];
                    options |= NSPrintPanelShowsPaperSize | NSPrintPanelShowsOrientation | NSPrintPanelShowsPageSetupAccessory;
                    [printPanel setOptions:options];
                }
                [printOp setShowsPrintPanel:YES];
                [printOp runOperation];
                return;
            }
        }
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
	if window != nil && window.NativeWindow() != nil {
		C.DKSTPrintCurrentWindow(window.NativeWindow())
	} else if window != nil {
		_ = window.Print()
	}
}
