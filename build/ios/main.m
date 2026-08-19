//go:build ios
// Minimal bootstrap: delegate comes from Go archive (WailsAppDelegate)
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>
#include <stdio.h>

@interface UIViewController (DKSTCustomEditMenu)
- (void)triggerDKSTSearchInDocInView:(UIView *)view;
@end

@implementation UIViewController (DKSTCustomEditMenu)
- (void)buildMenuWithBuilder:(id<UIMenuBuilder>)builder {
    [super buildMenuWithBuilder:builder];
    if (@available(iOS 16.0, *)) {
        // Strip heavy/unnecessary lookup and sharing menus
        [builder removeMenuForIdentifier:UIMenuLookup];
        [builder removeMenuForIdentifier:UIMenuShare];
        [builder removeMenuForIdentifier:UIMenuLearn];
        [builder removeMenuForIdentifier:UIMenuFormat];

        // Add custom "Search in Doc" action
        __weak typeof(self) weakSelf = self;
        UIAction *searchAction = [UIAction actionWithTitle:@"Search in Doc"
                                                     image:[UIImage systemImageNamed:@"magnifyingglass"]
                                                identifier:@"com.dinkisstyle.searchInDoc"
                                                   handler:^(__kindof UIAction * _Nonnull action) {
            UIWindow *keyWindow = nil;
            for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
                if ([scene isKindOfClass:[UIWindowScene class]] && scene.activationState == UISceneActivationStateForegroundActive) {
                    keyWindow = ((UIWindowScene *)scene).windows.firstObject;
                    break;
                }
            }
            if (keyWindow && weakSelf) {
                [weakSelf triggerDKSTSearchInDocInView:keyWindow];
            }
        }];

        UIMenu *customMenu = [UIMenu menuWithTitle:@""
                                             image:nil
                                        identifier:@"com.dinkisstyle.customEditMenu"
                                           options:UIMenuOptionsDisplayInline
                                          children:@[searchAction]];
        [builder insertSiblingMenu:customMenu afterMenuForIdentifier:UIMenuStandardEdit];
    }
}

- (void)triggerDKSTSearchInDocInView:(UIView *)view {
    if ([view isKindOfClass:[WKWebView class]]) {
        WKWebView *webView = (WKWebView *)view;
        [webView evaluateJavaScript:@"(function(){ const t = window.getSelection() ? window.getSelection().toString() : ''; if (window.searchInDocument) { window.searchInDocument(t); } else { window.dispatchEvent(new CustomEvent('app:search-text', { detail: { query: t } })); } return t; })();" completionHandler:nil];
        return;
    }
    for (UIView *subview in view.subviews) {
        [self triggerDKSTSearchInDocInView:subview];
    }
}
@end

// Referencing the class directly prevents the static linker from stripping the
// Wails app delegate out of the Go c-archive.
@interface WailsAppDelegate : UIResponder <UIApplicationDelegate>
@property (strong, nonatomic) UIWindow *window;
@end

extern WailsAppDelegate *appDelegate;

@interface WailsAppDelegate (SceneLifecycleForwarding)
- (void)applicationDidBecomeActive:(UIApplication *)application;
- (void)applicationWillResignActive:(UIApplication *)application;
- (void)applicationWillEnterForeground:(UIApplication *)application;
- (void)applicationDidEnterBackground:(UIApplication *)application;
@end

@interface WailsSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (strong, nonatomic) UIWindow *window;
@end

@implementation WailsSceneDelegate
- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions {
    if (![scene isKindOfClass:[UIWindowScene class]] || appDelegate == nil) {
        return;
    }

    UIWindowScene *windowScene = (UIWindowScene *)scene;
    UIViewController *rootViewController = appDelegate.window.rootViewController;
    UIColor *backgroundColor = appDelegate.window.backgroundColor
        ?: [UIColor colorNamed:@"LaunchBackground"]
        ?: [UIColor whiteColor];

    UIWindow *sceneWindow = [[UIWindow alloc] initWithWindowScene:windowScene];
    sceneWindow.backgroundColor = backgroundColor;
    if (rootViewController == nil) {
        rootViewController = [[UIViewController alloc] init];
        rootViewController.view.backgroundColor = backgroundColor;
    }
    sceneWindow.rootViewController = rootViewController;
    [sceneWindow makeKeyAndVisible];

    self.window = sceneWindow;
    appDelegate.window = sceneWindow;
}

- (void)sceneDidBecomeActive:(UIScene *)scene {
    [appDelegate applicationDidBecomeActive:[UIApplication sharedApplication]];
}

- (void)sceneWillResignActive:(UIScene *)scene {
    [appDelegate applicationWillResignActive:[UIApplication sharedApplication]];
}

- (void)sceneWillEnterForeground:(UIScene *)scene {
    [appDelegate applicationWillEnterForeground:[UIApplication sharedApplication]];
}

- (void)sceneDidEnterBackground:(UIScene *)scene {
    [appDelegate applicationDidEnterBackground:[UIApplication sharedApplication]];
}
@end

@interface WailsAppDelegate (SceneSupport)
- (UISceneConfiguration *)application:(UIApplication *)application
    configurationForConnectingSceneSession:(UISceneSession *)connectingSceneSession
                                options:(UISceneConnectionOptions *)options;
@end

@implementation WailsAppDelegate (SceneSupport)
- (UISceneConfiguration *)application:(UIApplication *)application
    configurationForConnectingSceneSession:(UISceneSession *)connectingSceneSession
                                options:(UISceneConnectionOptions *)options {
    UISceneConfiguration *configuration = [[UISceneConfiguration alloc]
        initWithName:@"Default Configuration"
        sessionRole:connectingSceneSession.role];
    configuration.delegateClass = [WailsSceneDelegate class];
    return configuration;
}
@end

int main(int argc, char * argv[]) {
    @autoreleasepool {
        (void)[WailsSceneDelegate class];
        (void)[WailsAppDelegate class];

        // Disable buffering so stdout/stderr from Go log.Printf flush immediately
        setvbuf(stdout, NULL, _IONBF, 0);
        setvbuf(stderr, NULL, _IONBF, 0);

        // Call UIApplicationMain IMMEDIATELY and start NOTHING else here. Do not
        // start the Go runtime yet: starting it concurrently with UIApplicationMain
        // intermittently corrupts the FrontBoard launch handshake on a physical
        // device, so the app delegate's didFinishLaunchingWithOptions never fires
        // (blank cold launch / 0x8BADF00D). Instead, the WailsAppDelegate (provided
        // by the Go archive) starts the Go runtime itself from
        // didFinishLaunchingWithOptions — i.e. only AFTER UIKit has delivered the
        // launch — so the runtime never races the launch handshake.
        return UIApplicationMain(argc, argv, nil, @"WailsAppDelegate");
    }
}
