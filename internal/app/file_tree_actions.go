/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func (a *App) DuplicateFileTreePath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("path is required")
	}

	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}

	target, err := nextDuplicatePath(path, info.IsDir())
	if err != nil {
		return "", err
	}

	if info.IsDir() {
		if err := copyDirectory(path, target); err != nil {
			return "", err
		}
	} else {
		if err := copyRegularFile(path, target, info.Mode()); err != nil {
			return "", err
		}
	}
	return target, nil
}

func (a *App) DeleteFileTreePath(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("path is required")
	}
	if _, err := os.Stat(path); err != nil {
		return err
	}
	return os.RemoveAll(path)
}

func (a *App) RenameFileTreePath(path string, newName string) (string, error) {
	path = strings.TrimSpace(path)
	newName = strings.TrimSpace(newName)
	if path == "" {
		return "", fmt.Errorf("path is required")
	}
	if newName == "" {
		return "", fmt.Errorf("new name is required")
	}
	if newName != filepath.Base(newName) || strings.ContainsAny(newName, `/\`) {
		return "", fmt.Errorf("new name must not include path separators")
	}
	if _, err := os.Stat(path); err != nil {
		return "", err
	}

	target := filepath.Join(filepath.Dir(path), newName)
	if filepath.Clean(target) == filepath.Clean(path) {
		return path, nil
	}
	if _, err := os.Stat(target); err == nil {
		return "", fmt.Errorf("%s already exists", newName)
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if err := os.Rename(path, target); err != nil {
		return "", err
	}
	return target, nil
}

func nextDuplicatePath(path string, isDir bool) (string, error) {
	dir := filepath.Dir(path)
	ext := ""
	base := filepath.Base(path)
	if !isDir {
		ext = filepath.Ext(base)
		base = strings.TrimSuffix(base, ext)
	}

	for index := 1; index < 10000; index++ {
		suffix := " copy"
		if index > 1 {
			suffix = fmt.Sprintf(" copy %d", index)
		}
		candidate := filepath.Join(dir, base+suffix+ext)
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate, nil
		} else if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("could not choose a duplicate path")
}

func copyRegularFile(source string, target string, mode os.FileMode) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode.Perm())
	if err != nil {
		return err
	}
	defer output.Close()

	if _, err := io.Copy(output, input); err != nil {
		return err
	}
	return output.Sync()
}

func copyDirectory(source string, target string) error {
	sourceInfo, err := os.Stat(source)
	if err != nil {
		return err
	}
	if err := os.Mkdir(target, sourceInfo.Mode().Perm()); err != nil {
		return err
	}

	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == source {
			return nil
		}

		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		nextTarget := filepath.Join(target, rel)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return os.Mkdir(nextTarget, info.Mode().Perm())
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		return copyRegularFile(path, nextTarget, info.Mode())
	})
}
