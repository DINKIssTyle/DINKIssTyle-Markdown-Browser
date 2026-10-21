package app

import (
	"fmt"
	"path/filepath"
	"strings"
)

func hasUnsavedSessions(sessions []EditorSessionState) bool {
	for _, session := range sessions {
		if session.IsEditing && session.HasUnsaved {
			return true
		}
	}
	return false
}

// confirmUnsavedSessions returns true when quitting must be cancelled.
func confirmUnsavedSessions(sessions []EditorSessionState, ask func(string, string) string, save func(string, string) error, showError func(string, string)) bool {
	for _, session := range sessions {
		if !session.IsEditing || !session.HasUnsaved {
			continue
		}
		path := strings.TrimSpace(session.CurrentPath)
		title := strings.TrimSpace(session.Title)
		if title == "" && path != "" {
			title = filepath.Base(path)
		}
		response := ask("Unsaved Changes", buildSaveChangesMessage(title, "The document has been modified. Do you want to save changes before quitting?"))
		switch response {
		case "Save":
			if path == "" || strings.HasPrefix(path, "__mobile_untitled__/") {
				showError("Save Failed", "This document does not have a save path yet. Save it manually before quitting.")
				return true
			}
			if err := save(path, session.Content); err != nil {
				showError("Save Failed", fmt.Sprintf("Failed to save changes before quitting.\n\n%s", err))
				return true
			}
		case "Discard":
			continue
		default:
			return true
		}
	}
	return false
}
