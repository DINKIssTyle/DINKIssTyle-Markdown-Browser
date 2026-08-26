//go:build darwin && !ios

package app

/*
#cgo CFLAGS: -x objective-c -fobjc-arc -fblocks
#cgo LDFLAGS: -framework Foundation -ldl
#include <dlfcn.h>
#include <stdlib.h>
#import <Foundation/Foundation.h>

typedef int32_t (*DKSTStatusFunction)(void);
typedef char *(*DKSTGenerateFunction)(const char *, const char *, double, char **);

static void *DKSTAppleBridgeHandle(void) {
    static void *handle = NULL;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        NSString *frameworks = [[NSBundle mainBundle] privateFrameworksPath];
        NSString *path = [frameworks stringByAppendingPathComponent:@"libDKSTAppleIntelligence.dylib"];
        handle = dlopen(path.fileSystemRepresentation, RTLD_NOW | RTLD_LOCAL);
    });
    return handle;
}

static int DKSTNativeAppleIntelligenceStatus(void) {
    void *handle = DKSTAppleBridgeHandle();
    if (handle == NULL) return 7;
    DKSTStatusFunction function = (DKSTStatusFunction)dlsym(handle, "DKSTAppleIntelligenceStatus");
    return function == NULL ? 7 : function();
}

static char *DKSTNativeAppleIntelligenceGenerate(const char *instructions, const char *prompt, double temperature, char **errorOut) {
    void *handle = DKSTAppleBridgeHandle();
    if (handle == NULL) {
        if (errorOut != NULL) *errorOut = strdup("The Apple Intelligence native component could not be loaded.");
        return NULL;
    }
    DKSTGenerateFunction function = (DKSTGenerateFunction)dlsym(handle, "DKSTAppleIntelligenceGenerate");
    if (function == NULL) {
        if (errorOut != NULL) *errorOut = strdup("The Apple Intelligence native component is incomplete.");
        return NULL;
    }
    return function(instructions, prompt, temperature, errorOut);
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

func nativeAppleIntelligenceStatus() int {
	return int(C.DKSTNativeAppleIntelligenceStatus())
}

func nativeAppleIntelligenceGenerate(instructions string, prompt string, temperature float64) (string, error) {
	cInstructions := C.CString(instructions)
	cPrompt := C.CString(prompt)
	defer C.free(unsafe.Pointer(cInstructions))
	defer C.free(unsafe.Pointer(cPrompt))

	var cError *C.char
	cResult := C.DKSTNativeAppleIntelligenceGenerate(cInstructions, cPrompt, C.double(temperature), &cError)
	if cError != nil {
		defer C.free(unsafe.Pointer(cError))
	}
	if cResult == nil {
		message := "Apple Intelligence could not generate a response"
		if cError != nil {
			message = C.GoString(cError)
		}
		return "", fmt.Errorf("%s", message)
	}
	defer C.free(unsafe.Pointer(cResult))
	return C.GoString(cResult), nil
}
