package app

import "testing"

func TestIsEphemeralIOSIncomingDocument(t *testing.T) {
	tempDir := "/private/var/mobile/Containers/Data/Application/11111111-2222-3333-4444-555555555555/tmp"
	docsDir := "/private/var/mobile/Containers/Data/Application/11111111-2222-3333-4444-555555555555/Documents"

	tests := []struct {
		name string
		path string
		want bool
	}{
		{name: "temporary import", path: tempDir + "/com.dinkisstyle.mdbrowser-Inbox/Cloud.md", want: true},
		{name: "documents inbox", path: docsDir + "/Inbox/Shared.md", want: true},
		{name: "normal app document", path: docsDir + "/Notes/Local.md", want: false},
		{name: "icloud drive", path: "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Cloud.md", want: false},
		{name: "third party provider", path: "/private/var/mobile/Containers/Shared/AppGroup/provider/File Provider Storage/Cloud.md", want: false},
		{name: "temp prefix sibling", path: tempDir + "-backup/Cloud.md", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isEphemeralIOSIncomingDocument(test.path, tempDir, docsDir); got != test.want {
				t.Fatalf("isEphemeralIOSIncomingDocument(%q) = %v, want %v", test.path, got, test.want)
			}
		})
	}
}

func TestPreviousIOSContainerDocumentRelativePath(t *testing.T) {
	const oldContainer = "/private/var/mobile/Containers/Data/Application/A1B2C3D4-E5F6-7890-ABCD-EF1234567890/Documents"

	tests := []struct {
		name string
		path string
		want string
		ok   bool
	}{
		{name: "root document", path: oldContainer + "/Note.md", want: "Note.md", ok: true},
		{name: "nested document", path: oldContainer + "/Projects/Note.md", want: "Projects/Note.md", ok: true},
		{name: "icloud", path: "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/Note.md"},
		{name: "non uuid container", path: "/private/var/mobile/Containers/Data/Application/not-a-uuid/Documents/Note.md"},
		{name: "library path", path: "/private/var/mobile/Containers/Data/Application/A1B2C3D4-E5F6-7890-ABCD-EF1234567890/Library/Note.md"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, ok := previousIOSContainerDocumentRelativePath(test.path)
			if got != test.want || ok != test.ok {
				t.Fatalf("previousIOSContainerDocumentRelativePath(%q) = (%q, %v), want (%q, %v)", test.path, got, ok, test.want, test.ok)
			}
		})
	}
}

func TestEnsureMarkdownExtension(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{name: "empty selection", path: "", want: ""},
		{name: "missing extension", path: "/tmp/Untitled", want: "/tmp/Untitled.md"},
		{name: "markdown extension", path: "/tmp/Untitled.md", want: "/tmp/Untitled.md"},
		{name: "long markdown extension", path: "/tmp/Untitled.markdown", want: "/tmp/Untitled.markdown"},
		{name: "explicit other extension", path: "/tmp/Untitled.txt", want: "/tmp/Untitled.txt"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := ensureMarkdownExtension(test.path); got != test.want {
				t.Fatalf("ensureMarkdownExtension(%q) = %q, want %q", test.path, got, test.want)
			}
		})
	}
}
