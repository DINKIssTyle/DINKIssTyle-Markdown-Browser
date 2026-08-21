//go:build !android

package main

func registerAndroidOpenFileHandler(_ func(string)) {}
