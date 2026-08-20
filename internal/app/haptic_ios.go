//go:build ios

package app

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework UIKit
#import <UIKit/UIKit.h>

static inline void dkst_ios_haptic(const char *style) {
	dispatch_async(dispatch_get_main_queue(), ^{
		if (style != NULL && strcmp(style, "selection") == 0) {
			UISelectionFeedbackGenerator *generator = [[UISelectionFeedbackGenerator alloc] init];
			[generator prepare];
			[generator selectionChanged];
			return;
		}
		UIImpactFeedbackStyle impactStyle = UIImpactFeedbackStyleMedium;
		if (style != NULL) {
			if (strcmp(style, "light") == 0) {
				impactStyle = UIImpactFeedbackStyleLight;
			} else if (strcmp(style, "heavy") == 0) {
				impactStyle = UIImpactFeedbackStyleHeavy;
			}
		}
		UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:impactStyle];
		[generator prepare];
		[generator impactOccurred];
	});
}
*/
import "C"
import "unsafe"

func platformHaptic(style string) {
	cStyle := C.CString(style)
	defer C.free(unsafe.Pointer(cStyle))
	C.dkst_ios_haptic(cStyle)
}
