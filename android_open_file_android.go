//go:build android

package main

/*
#include <jni.h>
#include <stdlib.h>

static const char* get_jni_utf_chars(JNIEnv *env, jstring str) {
    if (!env || !str) return NULL;
    return (*env)->GetStringUTFChars(env, str, NULL);
}

static void release_jni_utf_chars(JNIEnv *env, jstring str, const char *chars) {
    if (env && str && chars) {
        (*env)->ReleaseStringUTFChars(env, str, chars);
    }
}
*/
import "C"

import (
	"sync"
)

var androidOpenFiles struct {
	sync.Mutex
	handler func(string)
	pending []string
}

// registerAndroidOpenFileHandler connects Android Intent open/share callbacks to the
// application's normal open-file queue.
func registerAndroidOpenFileHandler(handler func(string)) {
	androidOpenFiles.Lock()
	androidOpenFiles.handler = handler
	pending := append([]string(nil), androidOpenFiles.pending...)
	androidOpenFiles.pending = nil
	androidOpenFiles.Unlock()

	for _, path := range pending {
		handler(path)
	}
}

// Java_com_wails_app_MainActivity_nativeOpenAndroidFile is called by MainActivity
// when an ACTION_VIEW or ACTION_SEND Intent delivers a file or shared document.
//
//export Java_com_wails_app_MainActivity_nativeOpenAndroidFile
func Java_com_wails_app_MainActivity_nativeOpenAndroidFile(env *C.JNIEnv, clazz C.jclass, jPath C.jstring) {
	if env == nil {
		return
	}

	cStr := C.get_jni_utf_chars(env, jPath)
	if cStr == nil {
		return
	}
	defer C.release_jni_utf_chars(env, jPath, cStr)

	path := C.GoString(cStr)
	if path == "" {
		return
	}

	androidOpenFiles.Lock()
	handler := androidOpenFiles.handler
	if handler == nil {
		androidOpenFiles.pending = append(androidOpenFiles.pending, path)
	}
	androidOpenFiles.Unlock()

	if handler != nil {
		handler(path)
	}
}
