package app

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestPrepareQuitAllowsCleanEditor(t *testing.T) {
	a := &App{
		editorStates: []EditorSessionState{{
			IsEditing:  true,
			HasUnsaved: false,
		}},
	}

	allow, prompt := a.prepareQuit()
	if !allow || prompt {
		t.Fatalf("prepareQuit() = (%v, %v), want (true, false)", allow, prompt)
	}
}

func TestPrepareQuitPromptsOnlyOnceForUnsavedEditor(t *testing.T) {
	a := &App{
		editorStates: []EditorSessionState{{
			IsEditing:  true,
			HasUnsaved: true,
		}},
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
		editorStates: []EditorSessionState{{
			IsEditing:  true,
			HasUnsaved: true,
		}},
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
		editorStates: []EditorSessionState{{
			IsEditing:  true,
			HasUnsaved: true,
		}},
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

func TestSyncEditorSessionsIgnoresOutOfOrderSnapshots(t *testing.T) {
	a := &App{}
	dirty := []EditorSessionState{{TabID: "a", IsEditing: true, HasUnsaved: true, Content: "new"}}
	a.SyncEditorSessions(2, dirty)
	a.SyncEditorSessions(1, nil)
	a.SyncEditorSessions(2, nil)
	dirty[0].Content = "mutated"
	if len(a.editorStates) != 1 || a.editorStates[0].Content != "new" {
		t.Fatalf("newest snapshot was lost: %+v", a.editorStates)
	}
	a.SyncEditorSessions(3, nil)
	if allow, prompt := a.prepareQuit(); !allow || prompt {
		t.Fatal("closing the final dirty tab should clear the quit guard")
	}
}

func TestPrepareQuitProtectsBackgroundTabs(t *testing.T) {
	a := &App{}
	a.SyncEditorSessions(1, []EditorSessionState{
		{TabID: "background", IsEditing: true, HasUnsaved: true, CurrentPath: "/a.md", Content: "A"},
	})
	if allow, prompt := a.prepareQuit(); allow || !prompt {
		t.Fatal("a dirty background tab must prevent immediate quit")
	}
	a.quitApprovedRevision = 1
	a.finishQuitPrompt(false)
	a.SyncEditorSessions(2, []EditorSessionState{{IsEditing: true, HasUnsaved: true, Content: "new edit"}})
	if allow, prompt := a.prepareQuit(); allow || !prompt {
		t.Fatal("new edits must invalidate an earlier quit approval")
	}
}

func TestConfirmUnsavedSessions(t *testing.T) {
	for _, tc := range []struct {
		name                               string
		responses                          []string
		failSave                           bool
		path                               string
		wantCancel                         bool
		wantPrompts, wantSaves, wantErrors int
	}{
		{"save all", []string{"Save", "Save"}, false, "/a.md", false, 2, 2, 0},
		{"discard then save", []string{"Discard", "Save"}, false, "/a.md", false, 2, 1, 0},
		{"cancel second", []string{"Save", "Cancel"}, false, "/a.md", true, 2, 1, 0},
		{"save failure", []string{"Save"}, true, "/a.md", true, 1, 1, 1},
		{"untitled", []string{"Save"}, false, "__mobile_untitled__/Untitled.md", true, 1, 0, 1},
		{"missing path", []string{"Save"}, false, "", true, 1, 0, 1},
		{"unknown response", []string{""}, false, "/a.md", true, 1, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sessions := []EditorSessionState{
				{Title: "clean"},
				{Title: "first", IsEditing: true, HasUnsaved: true, CurrentPath: tc.path, Content: "first content"},
				{Title: "second", IsEditing: true, HasUnsaved: true, CurrentPath: "/b.md", Content: "second content"},
			}
			prompts, saves, errorsShown := 0, 0, 0
			cancel := confirmUnsavedSessions(sessions, func(_, message string) string {
				if !strings.Contains(message, sessions[prompts+1].Title) {
					t.Errorf("wrong document in prompt: %s", message)
				}
				response := tc.responses[prompts]
				prompts++
				return response
			}, func(path, content string) error {
				saves++
				if path == "/b.md" && content != "second content" {
					t.Fatal("wrong content saved for background tab")
				}
				if tc.failSave {
					return fmt.Errorf("disk full")
				}
				return nil
			}, func(_, _ string) { errorsShown++ })
			if cancel != tc.wantCancel || prompts != tc.wantPrompts || saves != tc.wantSaves || errorsShown != tc.wantErrors {
				t.Fatalf("got cancel=%v prompts=%d saves=%d errors=%d", cancel, prompts, saves, errorsShown)
			}
		})
	}
}
