package app

import (
	"runtime"
	"strings"
	"testing"
)

func TestDescribeAppleIntelligenceAvailableIsConcise(t *testing.T) {
	status := describeAppleIntelligenceStatus(appleIntelligenceAvailable)
	if !status.Available || status.State != "available" {
		t.Fatalf("unexpected available status: %#v", status)
	}
	if status.Message != "Apple Intelligence is working." {
		t.Fatalf("available status should only confirm operation, got %q", status.Message)
	}
}

func TestDescribeAppleIntelligenceUnavailableStatesAreActionable(t *testing.T) {
	tests := []struct {
		code     int
		state    string
		contains string
	}{
		{appleIntelligenceNotEnabled, "not-enabled", "Apple Intelligence & Siri"},
		{appleIntelligenceModelNotReady, "model-not-ready", "Wi-Fi"},
		{appleIntelligenceOSNotSupported, "os-not-supported", "26"},
		{appleIntelligenceLocaleNotSupported, "locale-not-supported", "language"},
	}
	for _, test := range tests {
		status := describeAppleIntelligenceStatus(test.code)
		if status.Available || status.State != test.state || !strings.Contains(status.Message, test.contains) {
			t.Errorf("status %q is not actionable: %#v", test.state, status)
		}
	}
}

func TestDescribeAppleIntelligenceDeviceMinimumMatchesPlatform(t *testing.T) {
	status := describeAppleIntelligenceStatus(appleIntelligenceDeviceNotEligible)
	minimum := "M1"
	if runtime.GOOS == "ios" {
		minimum = "iPhone 15 Pro"
	}
	if !strings.Contains(status.Message, minimum) {
		t.Fatalf("device guidance does not contain %q: %q", minimum, status.Message)
	}
}
