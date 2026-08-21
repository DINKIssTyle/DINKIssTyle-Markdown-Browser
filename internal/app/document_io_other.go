//go:build !ios

package app

import "os"

func readDocumentFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

func writeDocumentFile(path string, content []byte, mode os.FileMode) error {
	return os.WriteFile(path, content, mode)
}
