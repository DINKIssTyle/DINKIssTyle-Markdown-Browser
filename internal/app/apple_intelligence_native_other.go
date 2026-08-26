//go:build !darwin && !ios

package app

import "fmt"

func nativeAppleIntelligenceStatus() int {
	return appleIntelligenceBridgeUnavailable
}

func nativeAppleIntelligenceGenerate(_ string, _ string, _ float64) (string, error) {
	return "", fmt.Errorf("Apple Intelligence is only available on supported Apple platforms")
}
