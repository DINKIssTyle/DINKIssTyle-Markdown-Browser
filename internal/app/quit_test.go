package app

import (
	"bytes"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestPrepareQuitAllowsCleanEditor(t *testing.T) {
	a := &App{
		editorState: EditorSessionState{
			IsEditing:  true,
			HasUnsaved: false,
		},
	}

	allow, prompt := a.prepareQuit()
	if !allow || prompt {
		t.Fatalf("prepareQuit() = (%v, %v), want (true, false)", allow, prompt)
	}
}

func TestPrepareQuitPromptsOnlyOnceForUnsavedEditor(t *testing.T) {
	a := &App{
		editorState: EditorSessionState{
			IsEditing:  true,
			HasUnsaved: true,
		},
	}

	allow, prompt := a.prepareQuit()
	if allow || !prompt {
		t.Fatalf("first prepareQuit() = (%v, %v), want (false, true)", allow, prompt)
	}

	allow, prompt = a.prepareQuit()
	if allow || prompt {
		t.Fatalf("second prepareQuit() = (%v, %v), want (false, false)", allow, prompt)
	}
}

func TestAcceptedQuitPromptAllowsExactlyOneRetry(t *testing.T) {
	a := &App{
		editorState: EditorSessionState{
			IsEditing:  true,
			HasUnsaved: true,
		},
	}

	a.prepareQuit()
	a.finishQuitPrompt(false)

	allow, prompt := a.prepareQuit()
	if !allow || prompt {
		t.Fatalf("accepted retry prepareQuit() = (%v, %v), want (true, false)", allow, prompt)
	}

	allow, prompt = a.prepareQuit()
	if allow || !prompt {
		t.Fatalf("next prepareQuit() = (%v, %v), want (false, true)", allow, prompt)
	}
}

func TestCancelledQuitPromptCanBeShownAgain(t *testing.T) {
	a := &App{
		editorState: EditorSessionState{
			IsEditing:  true,
			HasUnsaved: true,
		},
	}

	a.prepareQuit()
	a.finishQuitPrompt(true)

	allow, prompt := a.prepareQuit()
	if allow || !prompt {
		t.Fatalf("prepareQuit() after cancel = (%v, %v), want (false, true)", allow, prompt)
	}
}

func TestWithAppDialogIcon(t *testing.T) {
	previousIcon := appIconPNG
	t.Cleanup(func() {
		appIconPNG = previousIcon
	})

	expected := []byte{0x89, 0x50, 0x4e, 0x47}
	appIconPNG = expected
	dialog := &application.MessageDialog{}

	if result := withAppDialogIcon(dialog); result != dialog {
		t.Fatal("withAppDialogIcon should return the original dialog")
	}
	if !bytes.Equal(dialog.Icon, expected) {
		t.Fatalf("dialog icon = %v, want %v", dialog.Icon, expected)
	}
}

func TestWithAppDialogIconAllowsMissingIcon(t *testing.T) {
	previousIcon := appIconPNG
	t.Cleanup(func() {
		appIconPNG = previousIcon
	})

	appIconPNG = nil
	dialog := &application.MessageDialog{}

	withAppDialogIcon(dialog)
	if dialog.Icon != nil {
		t.Fatalf("dialog icon = %v, want nil", dialog.Icon)
	}
}
