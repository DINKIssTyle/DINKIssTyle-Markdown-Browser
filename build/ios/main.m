//go:build ios
// Minimal bootstrap: delegate comes from Go archive (WailsAppDelegate)
#import <UIKit/UIKit.h>
#include <stdio.h>

@interface WailsAppDelegate : UIResponder <UIApplicationDelegate>
@property (strong, nonatomic) UIWindow *window;
@end

extern WailsAppDelegate *appDelegate;

@interface WailsSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (strong, nonatomic) UIWindow *window;
@end

@implementation WailsSceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions {
    if ([scene isKindOfClass:[UIWindowScene class]]) {
        UIWindowScene *windowScene = (UIWindowScene *)scene;
        if (appDelegate != nil) {
            UIViewController *currentVC = appDelegate.window.rootViewController;
            UIColor *bg = (appDelegate.window && appDelegate.window.backgroundColor) ? appDelegate.window.backgroundColor : ([UIColor colorNamed:@"LaunchBackground"] ?: [UIColor whiteColor]);
            appDelegate.window = [[UIWindow alloc] initWithWindowScene:windowScene];
            appDelegate.window.backgroundColor = bg;
            if (currentVC != nil) {
                appDelegate.window.rootViewController = currentVC;
            } else {
                UIViewController *rootVC = [[UIViewController alloc] init];
                rootVC.view.backgroundColor = bg;
                appDelegate.window.rootViewController = rootVC;
            }
            [appDelegate.window makeKeyAndVisible];
            self.window = appDelegate.window;
        }
    }
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
    UISceneConfiguration *config = [[UISceneConfiguration alloc] initWithName:@"Default Configuration" sessionRole:connectingSceneSession.role];
    config.delegateClass = [WailsSceneDelegate class];
    return config;
}
@end

int main(int argc, char * argv[]) {
    @autoreleasepool {
        // Force linker to retain WailsSceneDelegate class symbol
        (void)[WailsSceneDelegate class];

        // Disable buffering so stdout/stderr from Go log.Printf flush immediately
        setvbuf(stdout, NULL, _IONBF, 0);
        setvbuf(stderr, NULL, _IONBF, 0);

        return UIApplicationMain(argc, argv, nil, @"WailsAppDelegate");
    }
}
