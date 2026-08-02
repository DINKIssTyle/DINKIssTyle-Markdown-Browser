//go:build darwin

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

@interface WailsContext : NSObject
@property (retain) NSWindow* mainWindow;
@property (retain) WKWebView* webview;
@end

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

static void DKSTInstallHistoryNavigationBridge(void *inctx) {
    dispatch_async(dispatch_get_main_queue(), ^{
        WailsContext *ctx = (__bridge WailsContext*) inctx;
        if (ctx == nil || ctx.mainWindow == nil || ctx.webview == nil) {
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

        NSWindow *mainWindow = ctx.mainWindow;
        WKWebView *webView = ctx.webview;

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

import "context"

func installHistoryNavigationBridge(ctx context.Context) {
	if ptr := wailsContextPointer(ctx); ptr != nil {
		C.DKSTInstallHistoryNavigationBridge(ptr)
	}
}
