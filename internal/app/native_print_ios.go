//go:build ios

package app

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework UIKit -framework WebKit
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

static WKWebView *DKSTFindWebView(UIView *view) {
    if ([view isKindOfClass:[WKWebView class]]) {
        return (WKWebView *)view;
    }
    for (UIView *child in view.subviews) {
        WKWebView *result = DKSTFindWebView(child);
        if (result != nil) return result;
    }
    return nil;
}

static void DKSTPrintIOSDocument(void *nativeController) {
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *controller = (__bridge UIViewController *)nativeController;
        if (controller == nil) return;

        WKWebView *webView = DKSTFindWebView(controller.view);
        if (webView == nil) return;

        UIPrintInteractionController *printer = [UIPrintInteractionController sharedPrintController];
        UIPrintInfo *info = [UIPrintInfo printInfo];
        info.outputType = UIPrintInfoOutputGeneral;
        info.jobName = @"DKST Markdown Browser";
        printer.printInfo = info;
        printer.printFormatter = webView.viewPrintFormatter;

        if ([UIDevice currentDevice].userInterfaceIdiom == UIUserInterfaceIdiomPad) {
            CGRect sourceRect = CGRectMake(CGRectGetMidX(controller.view.bounds), 8.0, 1.0, 1.0);
            [printer presentFromRect:sourceRect inView:controller.view animated:YES completionHandler:nil];
        } else {
            [printer presentAnimated:YES completionHandler:nil];
        }
    });
}
*/
import "C"

import "github.com/wailsapp/wails/v3/pkg/application"

//wails:ignore
func showPageSetup(_ *application.WebviewWindow) {
}

//wails:ignore
func printCurrentWindow(window *application.WebviewWindow) {
	if window != nil && window.NativeWindow() != nil {
		C.DKSTPrintIOSDocument(window.NativeWindow())
	}
}
