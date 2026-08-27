package app

import "testing"

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
