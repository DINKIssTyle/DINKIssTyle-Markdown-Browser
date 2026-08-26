package app

import (
	"context"
	"fmt"
	"runtime"
	"strings"
)

const (
	appleIntelligenceAvailable = iota
	appleIntelligenceDeviceNotEligible
	appleIntelligenceNotEnabled
	appleIntelligenceModelNotReady
	appleIntelligenceOSNotSupported
	appleIntelligenceLocaleNotSupported
	appleIntelligenceUnknown
	appleIntelligenceBridgeUnavailable
)

// AppleIntelligenceStatus describes whether Apple's on-device language model
// can be used and gives the settings UI an actionable explanation when it cannot.
type AppleIntelligenceStatus struct {
	Available bool   `json:"available"`
	State     string `json:"state"`
	Message   string `json:"message"`
}

func (a *App) GetAppleIntelligenceStatus() AppleIntelligenceStatus {
	return describeAppleIntelligenceStatus(nativeAppleIntelligenceStatus())
}

// MakeAppleIntelligenceRequest runs one stateless request through the system
// on-device model. The surrounding App method mirrors the HTTP-provider methods
// exposed to the frontend.
func (a *App) MakeAppleIntelligenceRequest(instructions string, prompt string, temperature float64) (string, error) {
	status := a.GetAppleIntelligenceStatus()
	if !status.Available {
		return "", fmt.Errorf("%s", status.Message)
	}

	ctx, cancel, requestID := a.beginAIRequest()
	defer cancel()
	defer a.finishAIRequest(requestID)

	result, err := nativeAppleIntelligenceGenerate(strings.TrimSpace(instructions), prompt, temperature)
	if err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if strings.TrimSpace(result) == "" {
		return "", fmt.Errorf("Apple Intelligence returned an empty response")
	}
	a.emit("ai:delta", map[string]any{"kind": "message", "text": result})
	return result, nil
}

func describeAppleIntelligenceStatus(code int) AppleIntelligenceStatus {
	switch code {
	case appleIntelligenceAvailable:
		return AppleIntelligenceStatus{Available: true, State: "available", Message: "Apple Intelligence is working."}
	case appleIntelligenceDeviceNotEligible:
		minimum := "Recommended minimum: an Apple silicon Mac with M1 or later."
		if runtime.GOOS == "ios" {
			minimum = "Recommended minimum: iPhone 15 Pro/Pro Max or iPhone 16 or later; iPad mini with A17 Pro, or iPad with M1 or later."
		}
		return AppleIntelligenceStatus{State: "device-not-eligible", Message: "This device does not support Apple Intelligence. " + minimum}
	case appleIntelligenceNotEnabled:
		settingsPath := "System Settings > Apple Intelligence & Siri"
		if runtime.GOOS == "ios" {
			settingsPath = "Settings > Apple Intelligence & Siri"
		}
		return AppleIntelligenceStatus{State: "not-enabled", Message: "Apple Intelligence is turned off. Turn it on in " + settingsPath + ", then return after setup finishes."}
	case appleIntelligenceModelNotReady:
		return AppleIntelligenceStatus{State: "model-not-ready", Message: "The on-device model is not ready. Keep Apple Intelligence turned on, connect to Wi-Fi and power, and wait for the model download to finish."}
	case appleIntelligenceOSNotSupported:
		return AppleIntelligenceStatus{State: "os-not-supported", Message: "Apple Intelligence in this app requires macOS 26 or iOS/iPadOS 26 or later."}
	case appleIntelligenceLocaleNotSupported:
		return AppleIntelligenceStatus{State: "locale-not-supported", Message: "The current language or region is not supported by the on-device model. In Apple Intelligence & Siri settings, choose a supported device and Siri language, and make sure both languages match."}
	case appleIntelligenceBridgeUnavailable:
		return AppleIntelligenceStatus{State: "app-support-unavailable", Message: "This build does not include the Apple Intelligence native component. Rebuild the app with Xcode 26 or later."}
	default:
		return AppleIntelligenceStatus{State: "unknown", Message: "Apple Intelligence is currently unavailable. Check Apple Intelligence & Siri settings, then try again."}
	}
}

func (a *App) requestAppleIntelligenceChat(ctx context.Context, ai TranslationAIConfig, systemPrompt string, userPrompt string) (string, error) {
	result, err := nativeAppleIntelligenceGenerate(systemPrompt, userPrompt, ai.Temperature)
	if err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return result, nil
}
