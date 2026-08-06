//go:build darwin && !ios

/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework Cocoa -framework WebKit
#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static id DKSTHistoryMouseMonitor = nil;
static id DKSTHistorySwipeMonitor = nil;
static id DKSTHistoryScrollMonitor = nil;

static void DKSTDispatchHistoryNavigation(WKWebView *webView, NSString *direction, NSString *source) {
    if (webView == nil) {
        return;
    }

    NSString *script = [NSString stringWithFormat:
        @"window.dispatchEvent(new CustomEvent('dkst:native-history-navigation',"
         "{detail:{direction:'%@',source:'%@'}}));",
        direction, source];
    [webView evaluateJavaScript:script completionHandler:nil];
}

static void DKSTDispatchHistoryGesturePhase(WKWebView *webView, NSString *phase) {
    if (webView == nil) {
        return;
    }

    NSString *script = [NSString stringWithFormat:
        @"window.dispatchEvent(new CustomEvent('dkst:native-history-gesture-phase',"
         "{detail:{phase:'%@'}}));",
        phase];
    [webView evaluateJavaScript:script completionHandler:nil];
}

static WKWebView *DKSTFindWebView(NSView *view) {
    if ([view isKindOfClass:[WKWebView class]]) {
        return (WKWebView *)view;
    }
    for (NSView *child in view.subviews) {
        WKWebView *result = DKSTFindWebView(child);
        if (result != nil) return result;
    }
    return nil;
}

static void DKSTInstallHistoryNavigationBridge(void *nativeWindow) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *mainWindow = (__bridge NSWindow*) nativeWindow;
        WKWebView *webView = mainWindow == nil ? nil : DKSTFindWebView(mainWindow.contentView);
        if (mainWindow == nil || webView == nil) {
            return;
        }

        if (DKSTHistoryMouseMonitor != nil) {
            [NSEvent removeMonitor:DKSTHistoryMouseMonitor];
            DKSTHistoryMouseMonitor = nil;
        }
        if (DKSTHistorySwipeMonitor != nil) {
            [NSEvent removeMonitor:DKSTHistorySwipeMonitor];
            DKSTHistorySwipeMonitor = nil;
        }
        if (DKSTHistoryScrollMonitor != nil) {
            [NSEvent removeMonitor:DKSTHistoryScrollMonitor];
            DKSTHistoryScrollMonitor = nil;
        }

        DKSTHistoryMouseMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskOtherMouseDown
            handler:^NSEvent *(NSEvent *event) {
                if (event.window != mainWindow) {
                    return event;
                }

                if (event.buttonNumber == 3) {
                    DKSTDispatchHistoryNavigation(webView, @"back", @"mouse");
                    return nil;
                }
                if (event.buttonNumber == 4) {
                    DKSTDispatchHistoryNavigation(webView, @"forward", @"mouse");
                    return nil;
                }
                return event;
            }];

        DKSTHistorySwipeMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskSwipe
            handler:^NSEvent *(NSEvent *event) {
                if (event.window != mainWindow || event.deltaX == 0) {
                    return event;
                }

                NSString *direction = event.deltaX < 0 ? @"back" : @"forward";
                DKSTDispatchHistoryNavigation(webView, direction, @"swipe");
                return nil;
            }];

        DKSTHistoryScrollMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel
            handler:^NSEvent *(NSEvent *event) {
                if (event.window != mainWindow) {
                    return event;
                }

                if ((event.phase & NSEventPhaseEnded) != 0) {
                    DKSTDispatchHistoryGesturePhase(webView, @"ended");
                } else if ((event.phase & NSEventPhaseCancelled) != 0) {
                    DKSTDispatchHistoryGesturePhase(webView, @"cancelled");
                }
                return event;
            }];
    });
}
*/
import "C"

import "github.com/wailsapp/wails/v3/pkg/application"

//wails:ignore
func installHistoryNavigationBridge(window *application.WebviewWindow) {
	if window != nil && window.NativeWindow() != nil {
		C.DKSTInstallHistoryNavigationBridge(window.NativeWindow())
	}
}
