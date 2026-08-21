//go:build ios

package app

/*
#cgo CFLAGS: -x objective-c -fobjc-arc -fblocks
#cgo LDFLAGS: -framework Foundation

#import <Foundation/Foundation.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

static void DKSTSetDocumentError(char **errorMessage, NSError *error) {
    if (errorMessage == NULL || error == nil) {
        return;
    }
    const char *message = error.localizedDescription.UTF8String;
    if (message != NULL) {
        *errorMessage = strdup(message);
    }
}

static void *DKSTCoordinatedReadDocument(const char *filePath, size_t *length, char **errorMessage) {
    if (length != NULL) *length = 0;
    if (errorMessage != NULL) *errorMessage = NULL;
    if (filePath == NULL) return NULL;

    NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:filePath]];
    NSFileCoordinator *coordinator = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
    __block NSData *content = nil;
    __block NSError *accessError = nil;
    NSError *coordinationError = nil;
    [coordinator coordinateReadingItemAtURL:url
                                    options:0
                                      error:&coordinationError
                                 byAccessor:^(NSURL *coordinatedURL) {
        content = [NSData dataWithContentsOfURL:coordinatedURL options:0 error:&accessError];
    }];

    NSError *error = coordinationError ?: accessError;
    if (error != nil || content == nil) {
        DKSTSetDocumentError(errorMessage, error);
        return NULL;
    }

    size_t contentLength = content.length;
    void *buffer = malloc(contentLength == 0 ? 1 : contentLength);
    if (buffer == NULL) {
        if (errorMessage != NULL) *errorMessage = strdup("Unable to allocate memory while reading the document.");
        return NULL;
    }
    if (contentLength > 0) memcpy(buffer, content.bytes, contentLength);
    if (length != NULL) *length = contentLength;
    return buffer;
}

static bool DKSTCoordinatedWriteDocument(const char *filePath, const void *bytes, size_t length, char **errorMessage) {
    if (errorMessage != NULL) *errorMessage = NULL;
    if (filePath == NULL) return false;

    NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:filePath]];
    NSData *content = [NSData dataWithBytes:(bytes ?: "") length:length];
    NSFileCoordinator *coordinator = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
    __block NSError *accessError = nil;
    NSError *coordinationError = nil;
    [coordinator coordinateWritingItemAtURL:url
                                    options:NSFileCoordinatorWritingForReplacing
                                      error:&coordinationError
                                 byAccessor:^(NSURL *coordinatedURL) {
        [content writeToURL:coordinatedURL options:NSDataWritingAtomic error:&accessError];
    }];

    NSError *error = coordinationError ?: accessError;
    if (error != nil) {
        DKSTSetDocumentError(errorMessage, error);
        return false;
    }
    return true;
}
*/
import "C"

import (
	"fmt"
	"os"
	"unsafe"
)

func readDocumentFile(path string) ([]byte, error) {
	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))

	var length C.size_t
	var errorMessage *C.char
	buffer := C.DKSTCoordinatedReadDocument(cPath, &length, &errorMessage)
	if errorMessage != nil {
		defer C.free(unsafe.Pointer(errorMessage))
	}
	if buffer == nil {
		if errorMessage != nil {
			return nil, fmt.Errorf("read document: %s", C.GoString(errorMessage))
		}
		return nil, fmt.Errorf("read document: unknown file coordination error")
	}
	defer C.free(buffer)
	return C.GoBytes(buffer, C.int(length)), nil
}

func writeDocumentFile(path string, content []byte, _ os.FileMode) error {
	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))

	var bytes unsafe.Pointer
	if len(content) > 0 {
		bytes = unsafe.Pointer(&content[0])
	}
	var errorMessage *C.char
	ok := C.DKSTCoordinatedWriteDocument(cPath, bytes, C.size_t(len(content)), &errorMessage)
	if errorMessage != nil {
		defer C.free(unsafe.Pointer(errorMessage))
	}
	if !bool(ok) {
		if errorMessage != nil {
			return fmt.Errorf("write document: %s", C.GoString(errorMessage))
		}
		return fmt.Errorf("write document: unknown file coordination error")
	}
	return nil
}
