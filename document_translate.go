/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const translationChunkTargetRunes = 6000
const translationChunkOverlapRunes = 800

type TranslationLanguage struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	NativeName string `json:"nativeName"`
	Suffix     string `json:"suffix"`
}

type TranslatedDocumentTarget struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	NativeName string `json:"nativeName"`
	Path       string `json:"path"`
	FileName   string `json:"fileName"`
	Exists     bool   `json:"exists"`
}

type TranslationAIConfig struct {
	Provider    string  `json:"provider"`
	Endpoint    string  `json:"endpoint"`
	Model       string  `json:"model"`
	Key         string  `json:"key"`
	Temperature float64 `json:"temperature"`
}

type TranslateDocumentRequest struct {
	SourcePath        string                `json:"sourcePath"`
	Content           string                `json:"content"`
	Languages         []TranslationLanguage `json:"languages"`
	AI                TranslationAIConfig   `json:"ai"`
	OverwriteExisting bool                  `json:"overwriteExisting"`
}

type TranslatedDocumentResult struct {
	Targets []TranslatedDocumentTarget `json:"targets"`
}

func (a *App) GetTranslationTargets(sourcePath string, languages []TranslationLanguage) ([]TranslatedDocumentTarget, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return nil, fmt.Errorf("source path is required")
	}
	if len(languages) == 0 {
		return nil, fmt.Errorf("at least one language is required")
	}

	targets := make([]TranslatedDocumentTarget, 0, len(languages))
	for _, language := range languages {
		targetPath, err := translatedDocumentPath(sourcePath, language)
		if err != nil {
			return nil, err
		}
		_, statErr := os.Stat(targetPath)
		if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
			return nil, statErr
		}
		targets = append(targets, TranslatedDocumentTarget{
			Code:       language.Code,
			Name:       language.Name,
			NativeName: language.NativeName,
			Path:       targetPath,
			FileName:   filepath.Base(targetPath),
			Exists:     statErr == nil,
		})
	}
	return targets, nil
}

func (a *App) TranslateDocumentCopies(req TranslateDocumentRequest) (TranslatedDocumentResult, error) {
	sourcePath := strings.TrimSpace(req.SourcePath)
	if sourcePath == "" {
		return TranslatedDocumentResult{}, fmt.Errorf("source path is required")
	}
	if strings.TrimSpace(req.Content) == "" {
		return TranslatedDocumentResult{}, fmt.Errorf("document content is empty")
	}
	if len(req.Languages) == 0 {
		return TranslatedDocumentResult{}, fmt.Errorf("at least one language is required")
	}
	if strings.TrimSpace(req.AI.Endpoint) == "" || strings.TrimSpace(req.AI.Model) == "" {
		return TranslatedDocumentResult{}, fmt.Errorf("AI endpoint and model are required")
	}

	targets, err := a.GetTranslationTargets(sourcePath, req.Languages)
	if err != nil {
		return TranslatedDocumentResult{}, err
	}
	if !req.OverwriteExisting {
		for _, target := range targets {
			if target.Exists {
				return TranslatedDocumentResult{}, fmt.Errorf("%s already exists", target.FileName)
			}
		}
	}

	ctx, cancel, requestID := a.beginAIRequest()
	defer cancel()
	defer a.finishAIRequest(requestID)

	chunks := chunkMarkdownForTranslation(req.Content)
	totalSteps := len(targets) * len(chunks)
	completedSteps := 0
	completedTargets := make([]TranslatedDocumentTarget, 0, len(targets))

	for targetIndex, target := range targets {
		var translated strings.Builder
		previousTranslatedTail := ""
		language := req.Languages[targetIndex]

		for chunkIndex, chunk := range chunks {
			if ctx.Err() != nil {
				return TranslatedDocumentResult{}, ctx.Err()
			}
			progress := 0
			if totalSteps > 0 {
				progress = int(float64(completedSteps) / float64(totalSteps) * 100)
			}
			runtime.EventsEmit(a.ctx, "translation:progress", map[string]any{
				"label":       fmt.Sprintf("Translating document %d of %d", targetIndex+1, len(targets)),
				"progress":    progress,
				"active":      true,
				"language":    target.Code,
				"chunk":       chunkIndex + 1,
				"chunkTotal":  len(chunks),
				"targetIndex": targetIndex + 1,
				"targetTotal": len(targets),
			})

			previousSourceTail := ""
			if chunkIndex > 0 {
				previousSourceTail = tailRunes(chunks[chunkIndex-1].Text, translationChunkOverlapRunes)
			}
			prompt := buildTranslationPrompt(req.Content, chunk.Text, previousSourceTail, previousTranslatedTail, language)
			next, err := a.requestTranslationChunk(ctx, req.AI, prompt)
			if err != nil {
				return TranslatedDocumentResult{}, err
			}
			next = strings.TrimSpace(stripMarkdownFence(next))
			if next != "" {
				if translated.Len() > 0 {
					translated.WriteString("\n\n")
				}
				translated.WriteString(next)
				previousTranslatedTail = tailRunes(next, translationChunkOverlapRunes)
			}
			completedSteps++
			if totalSteps > 0 {
				runtime.EventsEmit(a.ctx, "translation:progress", map[string]any{
					"label":       fmt.Sprintf("Translating document %d of %d", targetIndex+1, len(targets)),
					"progress":    int(float64(completedSteps) / float64(totalSteps) * 100),
					"active":      true,
					"language":    target.Code,
					"chunk":       chunkIndex + 1,
					"chunkTotal":  len(chunks),
					"targetIndex": targetIndex + 1,
					"targetTotal": len(targets),
				})
			}
		}

		if err := os.WriteFile(target.Path, []byte(translated.String()+"\n"), 0644); err != nil {
			return TranslatedDocumentResult{}, err
		}
		target.Exists = true
		completedTargets = append(completedTargets, target)
	}

	runtime.EventsEmit(a.ctx, "translation:progress", map[string]any{
		"label":     "Translation completed",
		"progress":  100,
		"active":    false,
		"completed": true,
	})

	return TranslatedDocumentResult{Targets: completedTargets}, nil
}

type translationChunk struct {
	Text string
}

func translatedDocumentPath(sourcePath string, language TranslationLanguage) (string, error) {
	suffix := strings.TrimSpace(language.Suffix)
	if suffix == "" {
		return "", fmt.Errorf("language suffix is required")
	}
	ext := filepath.Ext(sourcePath)
	base := strings.TrimSuffix(filepath.Base(sourcePath), ext)
	if base == "" || ext == "" {
		return "", fmt.Errorf("source path must include a file name and extension")
	}
	base = strings.TrimSuffix(base, sourceLanguageSuffix(base))
	return filepath.Join(filepath.Dir(sourcePath), base+suffix+ext), nil
}

func sourceLanguageSuffix(base string) string {
	parts := strings.Split(base, "-")
	if len(parts) >= 3 && isLowerAlpha(parts[len(parts)-2], 2) && isUpperAlpha(parts[len(parts)-1], 2) {
		return "-" + parts[len(parts)-2] + "-" + parts[len(parts)-1]
	}
	parts = strings.Split(base, "_")
	if len(parts) >= 2 {
		code := parts[len(parts)-1]
		codeParts := strings.Split(code, "-")
		if len(codeParts) == 2 && isLowerAlpha(codeParts[0], 2) && isUpperAlpha(codeParts[1], 2) {
			return "_" + code
		}
	}
	return ""
}

func isLowerAlpha(value string, length int) bool {
	if len(value) != length {
		return false
	}
	for _, char := range value {
		if char < 'a' || char > 'z' {
			return false
		}
	}
	return true
}

func isUpperAlpha(value string, length int) bool {
	if len(value) != length {
		return false
	}
	for _, char := range value {
		if char < 'A' || char > 'Z' {
			return false
		}
	}
	return true
}

func chunkMarkdownForTranslation(content string) []translationChunk {
	blocks := splitMarkdownBlocks(content)
	chunks := make([]translationChunk, 0)
	var current strings.Builder

	flush := func() {
		text := strings.TrimSpace(current.String())
		if text != "" {
			chunks = append(chunks, translationChunk{Text: text})
		}
		current.Reset()
	}

	for _, block := range blocks {
		block = strings.TrimRight(block, "\n")
		if block == "" {
			continue
		}
		if current.Len() > 0 && runeLen(current.String())+runeLen(block) > translationChunkTargetRunes {
			flush()
		}
		if current.Len() > 0 {
			current.WriteString("\n\n")
		}
		current.WriteString(block)
	}
	flush()

	if len(chunks) == 0 {
		return []translationChunk{{Text: strings.TrimSpace(content)}}
	}
	return chunks
}

func splitMarkdownBlocks(content string) []string {
	scanner := bufio.NewScanner(strings.NewReader(content))
	scanner.Buffer(make([]byte, 1024), 1024*1024)

	blocks := []string{}
	var current strings.Builder
	inFence := false

	flush := func() {
		text := strings.TrimRight(current.String(), "\n")
		if strings.TrimSpace(text) != "" {
			blocks = append(blocks, text)
		}
		current.Reset()
	}

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		isFence := strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~")
		if isFence {
			inFence = !inFence
		}
		if !inFence && trimmed == "" {
			flush()
			continue
		}
		current.WriteString(line)
		current.WriteString("\n")
	}
	flush()
	return blocks
}

func buildTranslationPrompt(fullDocument string, chunk string, previousSourceTail string, previousTranslatedTail string, language TranslationLanguage) string {
	var prompt strings.Builder
	prompt.WriteString("Translate the Markdown chunk into ")
	prompt.WriteString(language.Name)
	if language.NativeName != "" {
		prompt.WriteString(" (")
		prompt.WriteString(language.NativeName)
		prompt.WriteString(")")
	}
	prompt.WriteString(".\n\n")
	prompt.WriteString("Rules:\n")
	prompt.WriteString("- Preserve the original document's tone, voice, formality, and formatting.\n")
	prompt.WriteString("- Preserve Markdown structure, tables, code fences, inline code, front matter, HTML tags, image paths, link URLs, anchors, and file names.\n")
	prompt.WriteString("- Translate visible prose only.\n")
	prompt.WriteString("- Return only the translated version of <chunk_to_translate>. Do not include explanations, labels, or code fences around the whole answer.\n")
	prompt.WriteString("- Use the surrounding context only for continuity.\n\n")
	if previousSourceTail != "" {
		prompt.WriteString("<previous_source_tail>\n")
		prompt.WriteString(previousSourceTail)
		prompt.WriteString("\n</previous_source_tail>\n\n")
	}
	if previousTranslatedTail != "" {
		prompt.WriteString("<previous_translated_tail>\n")
		prompt.WriteString(previousTranslatedTail)
		prompt.WriteString("\n</previous_translated_tail>\n\n")
	}
	prompt.WriteString("<document_context_excerpt>\n")
	prompt.WriteString(headRunes(fullDocument, translationChunkOverlapRunes))
	prompt.WriteString("\n</document_context_excerpt>\n\n")
	prompt.WriteString("<chunk_to_translate>\n")
	prompt.WriteString(chunk)
	prompt.WriteString("\n</chunk_to_translate>")
	return prompt.String()
}

func (a *App) requestTranslationChunk(ctx context.Context, ai TranslationAIConfig, prompt string) (string, error) {
	provider := strings.ToLower(strings.TrimSpace(ai.Provider))
	if provider == "lmstudio" {
		return a.requestLMStudioTranslationChunk(ctx, ai, prompt)
	}
	return a.requestOpenAITranslationChunk(ctx, ai, prompt)
}

func (a *App) requestOpenAITranslationChunk(ctx context.Context, ai TranslationAIConfig, prompt string) (string, error) {
	base := normalizeAIEndpointBase(ai.Endpoint)
	endpoint := strings.TrimRight(base, "/") + "/v1/chat/completions"
	payload := map[string]any{
		"model": ai.Model,
		"messages": []map[string]string{
			{"role": "system", "content": "You are a careful Markdown document translator."},
			{"role": "user", "content": prompt},
		},
	}
	if ai.Temperature > 0 {
		payload["temperature"] = ai.Temperature
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	respBody, err := doTranslationPost(ctx, endpoint, ai.Key, body, 300*time.Second)
	if err != nil {
		return "", err
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("AI response did not include choices")
	}
	return parsed.Choices[0].Message.Content, nil
}

func (a *App) requestLMStudioTranslationChunk(ctx context.Context, ai TranslationAIConfig, prompt string) (string, error) {
	base := normalizeAIEndpointBase(ai.Endpoint)
	endpoint := strings.TrimRight(base, "/") + "/api/v1/chat"
	payload := map[string]any{
		"model":  ai.Model,
		"input":  "You are a careful Markdown document translator.\n\n" + prompt,
		"stream": true,
	}
	if ai.Temperature > 0 {
		payload["temperature"] = ai.Temperature
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	if strings.TrimSpace(ai.Key) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(ai.Key))
	}

	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var output strings.Builder
	reader := bufio.NewReader(resp.Body)
	var eventData []string
	for {
		line, err := reader.ReadString('\n')
		if err != nil && err != io.EOF {
			return "", err
		}
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "data:") {
			data := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
			if data != "" {
				eventData = append(eventData, data)
			}
		} else if trimmed == "" && len(eventData) > 0 {
			joined := strings.Join(eventData, "\n")
			eventData = nil
			var raw map[string]any
			if json.Unmarshal([]byte(joined), &raw) == nil {
				if next, ok := raw["content"].(string); ok {
					output.WriteString(next)
				}
			}
		}
		if err == io.EOF {
			break
		}
	}
	return output.String(), nil
}

func doTranslationPost(ctx context.Context, endpoint string, apiKey string, body []byte, timeout time.Duration) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return respBody, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}

func stripMarkdownFence(text string) string {
	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}
	lines := strings.Split(trimmed, "\n")
	if len(lines) >= 2 && strings.HasPrefix(strings.TrimSpace(lines[len(lines)-1]), "```") {
		return strings.TrimSpace(strings.Join(lines[1:len(lines)-1], "\n"))
	}
	return trimmed
}

func runeLen(text string) int {
	return len([]rune(text))
}

func headRunes(text string, limit int) string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit])
}

func tailRunes(text string, limit int) string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[len(runes)-limit:])
}
