//go:build ios

package app

/*
#cgo LDFLAGS: -framework Foundation
#include <stdint.h>
#include <stdlib.h>

extern int32_t DKSTAppleIntelligenceStatus(void);
extern char *DKSTAppleIntelligenceGenerate(const char *, const char *, double, char **);
*/
import "C"

import (
	"fmt"
	"unsafe"
)

func nativeAppleIntelligenceStatus() int {
	return int(C.DKSTAppleIntelligenceStatus())
}

func nativeAppleIntelligenceGenerate(instructions string, prompt string, temperature float64) (string, error) {
	cInstructions := C.CString(instructions)
	cPrompt := C.CString(prompt)
	defer C.free(unsafe.Pointer(cInstructions))
	defer C.free(unsafe.Pointer(cPrompt))

	var cError *C.char
	cResult := C.DKSTAppleIntelligenceGenerate(cInstructions, cPrompt, C.double(temperature), &cError)
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
