package main

import "testing"

func TestTranslatedDocumentPathReplacesExistingLanguageSuffix(t *testing.T) {
	tests := []struct {
		name       string
		sourcePath string
		suffix     string
		want       string
	}{
		{
			name:       "hyphen language suffix",
			sourcePath: "/docs/README-ko-KR.md",
			suffix:     "-zh-CN",
			want:       "/docs/README-zh-CN.md",
		},
		{
			name:       "underscore language suffix",
			sourcePath: "/docs/README_ko-KR.md",
			suffix:     "-zh-CN",
			want:       "/docs/README-zh-CN.md",
		},
		{
			name:       "plain source",
			sourcePath: "/docs/README.md",
			suffix:     "-zh-CN",
			want:       "/docs/README-zh-CN.md",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := translatedDocumentPath(tt.sourcePath, TranslationLanguage{Suffix: tt.suffix})
			if err != nil {
				t.Fatalf("translatedDocumentPath() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("translatedDocumentPath() = %q, want %q", got, tt.want)
			}
		})
	}
}
