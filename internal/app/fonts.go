/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import (
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"golang.org/x/image/font/sfnt"
)

// FontInfo stores font name and its file path
type FontInfo struct {
	Family string `json:"family"`
	Path   string `json:"path"`
}

// GetSystemFonts scans OS-specific directories for font files and returns family names
func (a *App) GetSystemFonts() []FontInfo {
	var fontDirs []string

	switch runtime.GOOS {
	case "darwin":
		fontDirs = []string{
			"/System/Library/Fonts/Supplemental",
			"/System/Library/Fonts",
			"/Library/Fonts",
			filepath.Join(os.Getenv("HOME"), "Library/Fonts"),
		}
	case "windows":
		windir := os.Getenv("WINDIR")
		if windir == "" {
			windir = "C:\\Windows"
		}
		fontDirs = []string{filepath.Join(windir, "Fonts")}
	case "linux":
		fontDirs = []string{
			"/usr/share/fonts",
			"/usr/local/share/fonts",
			filepath.Join(os.Getenv("HOME"), ".fonts"),
		}
	}

	var fonts []FontInfo
	seenFamilies := make(map[string]bool)

	for _, dir := range fontDirs {
		_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if info.IsDir() {
				return nil
			}

			ext := strings.ToLower(filepath.Ext(path))
			if ext == ".ttf" || ext == ".otf" || ext == ".ttc" || ext == ".otc" {
				func() {
					f, err := os.Open(path)
					if err != nil {
						return
					}
					defer f.Close()

					coll, err := sfnt.ParseCollectionReaderAt(f)
					if err != nil {
						// Fallback to base filename if parsing fails
						family := strings.TrimSuffix(filepath.Base(path), ext)
						family = strings.ReplaceAll(family, "-", " ")
						family = strings.ReplaceAll(family, "_", " ")
						
						family = strings.TrimSpace(family)
						if family != "" && !strings.HasPrefix(family, ".") {
							key := strings.ToLower(family)
							if !seenFamilies[key] {
								fonts = append(fonts, FontInfo{
									Family: family,
									Path:   path,
								})
								seenFamilies[key] = true
							}
						}
						return
					}

					numFonts := coll.NumFonts()
					for i := 0; i < numFonts; i++ {
						font, err := coll.Font(i)
						if err != nil {
							continue
						}
						var b sfnt.Buffer
						family, err := font.Name(&b, sfnt.NameIDFamily)
						if err != nil || family == "" {
							continue
						}

						family = strings.TrimSpace(family)
						if strings.HasPrefix(family, ".") {
							continue // skip internal hidden fonts starting with .
						}

						key := strings.ToLower(family)
						if !seenFamilies[key] {
							fonts = append(fonts, FontInfo{
								Family: family,
								Path:   path,
							})
							seenFamilies[key] = true
						}
					}
				}()
			}
			return nil
		})
	}

	sort.Slice(fonts, func(i, j int) bool {
		return strings.ToLower(fonts[i].Family) < strings.ToLower(fonts[j].Family)
	})

	return fonts
}
