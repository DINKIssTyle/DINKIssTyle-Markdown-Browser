//go:build ios
// Minimal bootstrap: delegate comes from Go archive (WailsAppDelegate)
#import <UIKit/UIKit.h>
#include <stdio.h>

// Exported by ios_open_file_ios.go in the Go c-archive.
extern void WailsIOSOpenFile(char *path);

// Keep security-scoped URLs active for the process lifetime. The editor may
// read linked resources or save the file well after the initial UIKit callback.
static NSMutableDictionary<NSString *, NSURL *> *WailsSecurityScopedURLs(void) {
    static NSMutableDictionary<NSString *, NSURL *> *urls = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        urls = [[NSMutableDictionary alloc] init];
    });
    return urls;
}

static void WailsOpenDocumentURL(NSURL *url) {
    if (url == nil || !url.isFileURL) {
        return;
    }

    NSString *path = url.path;
    if (path.length == 0) {
        return;
    }

    NSMutableDictionary<NSString *, NSURL *> *scopedURLs = WailsSecurityScopedURLs();
    if ([scopedURLs objectForKey:path] == nil && [url startAccessingSecurityScopedResource]) {
        [scopedURLs setObject:url forKey:path];
    }

    WailsIOSOpenFile((char *)path.fileSystemRepresentation);
}

static void WailsOpenURLContexts(NSSet<UIOpenURLContext *> *URLContexts) {
    for (UIOpenURLContext *context in URLContexts) {
        WailsOpenDocumentURL(context.URL);
    }
}

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
    UIWindow *sceneWindow = appDelegate.window;
    UIColor *backgroundColor = sceneWindow.backgroundColor
        ?: [UIColor colorNamed:@"LaunchBackground"]
        ?: [UIColor whiteColor];

    // Wails creates its bootstrap window in didFinishLaunchingWithOptions and
    // later replaces that window's root controller with the WebView controller.
    // Keep that same window instance when UIKit reconnects a persisted scene.
    // Creating a second window here can leave Wails updating a window that is
    // no longer presented, which appears as a black screen after a force-quit
    // and relaunch on iPadOS.
    if (sceneWindow == nil) {
        sceneWindow = [[UIWindow alloc] initWithWindowScene:windowScene];
    } else {
        sceneWindow.windowScene = windowScene;
    }
    sceneWindow.backgroundColor = backgroundColor;
    if (sceneWindow.rootViewController == nil) {
        UIViewController *rootViewController = [[UIViewController alloc] init];
        rootViewController.view.backgroundColor = backgroundColor;
        sceneWindow.rootViewController = rootViewController;
    }
    [sceneWindow makeKeyAndVisible];

    self.window = sceneWindow;
    appDelegate.window = sceneWindow;

    // Cold launch: the document URL is supplied with the scene connection.
    WailsOpenURLContexts(connectionOptions.URLContexts);
}

// Warm launch: Files or another app sends a document to an existing scene.
- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts {
    WailsOpenURLContexts(URLContexts);
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
