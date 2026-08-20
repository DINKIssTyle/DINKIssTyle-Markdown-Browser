//go:build android

package app

// On Android, haptic feedback is handled directly in WebView by WailsBridge.java.
func platformHaptic(style string) {}
