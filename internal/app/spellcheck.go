/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

package app

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

type SpellCheckLanguage struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	NativeName string `json:"nativeName"`
	Auto       bool   `json:"auto"`
}

type SpellCheckRequest struct {
	Content  string              `json:"content"`
	Language SpellCheckLanguage  `json:"language"`
	AI       TranslationAIConfig `json:"ai"`
}

type SpellCheckSuggestion struct {
	Original    string `json:"original"`
	Replacement string `json:"replacement"`
	Start       int    `json:"start"`
	End         int    `json:"end"`
	Reason      string `json:"reason"`
}

type SpellCheckResult struct {
	Suggestions []SpellCheckSuggestion `json:"suggestions"`
}

func (a *App) SpellCheckDocument(req SpellCheckRequest) (SpellCheckResult, error) {
	content := req.Content
	if strings.TrimSpace(content) == "" {
		return SpellCheckResult{}, fmt.Errorf("document content is empty")
	}
	if strings.TrimSpace(req.AI.Endpoint) == "" || strings.TrimSpace(req.AI.Model) == "" {
		return SpellCheckResult{}, fmt.Errorf("AI endpoint and model are required")
	}

	ctx, cancel, requestID := a.beginAIRequest()
	defer cancel()
	defer a.finishAIRequest(requestID)

	prompt := buildSpellCheckPrompt(content, req.Language)
	raw, err := a.requestSpellCheck(ctx, req.AI, prompt)
	if err != nil {
		return SpellCheckResult{}, err
	}

	suggestions, err := parseSpellCheckSuggestions(raw)
	if err != nil {
		return SpellCheckResult{}, err
	}
	return SpellCheckResult{Suggestions: normalizeSpellCheckSuggestions(content, suggestions)}, nil
}

func buildSpellCheckPrompt(content string, language SpellCheckLanguage) string {
	var prompt strings.Builder
	prompt.WriteString("Proofread the document text and return spelling, grammar, spacing, typo, and awkward-wording corrections.\n")
	if language.Auto || strings.TrimSpace(language.Code) == "" {
		prompt.WriteString("Language: auto-detect the document language.\n")
	} else {
		prompt.WriteString("Language: ")
		prompt.WriteString(language.Name)
		if language.NativeName != "" {
			prompt.WriteString(" (")
			prompt.WriteString(language.NativeName)
			prompt.WriteString(")")
		}
		prompt.WriteString(", locale ")
		prompt.WriteString(language.Code)
		prompt.WriteString(".\n")
	}
	prompt.WriteString("\nRules:\n")
	prompt.WriteString("- Return only JSON. No Markdown fences, no prose.\n")
	prompt.WriteString("- Use this exact shape: {\"suggestions\":[{\"original\":\"...\",\"replacement\":\"...\",\"start\":0,\"end\":0,\"reason\":\"...\"}]}.\n")
	prompt.WriteString("- start and end are zero-based UTF-16 code unit offsets in the provided document.\n")
	prompt.WriteString("- Keep Markdown syntax, code fences, inline code, links, image URLs, front matter keys, and HTML tags unchanged unless the visible prose itself has an error.\n")
	prompt.WriteString("- Do not rewrite style broadly. Suggest only clear corrections.\n")
	prompt.WriteString("- original must exactly match document.substring(start, end).\n")
	prompt.WriteString("- If there are no corrections, return {\"suggestions\":[]}.\n\n")
	prompt.WriteString("<document>\n")
	prompt.WriteString(content)
	prompt.WriteString("\n</document>")
	return prompt.String()
}

func (a *App) requestSpellCheck(ctx context.Context, ai TranslationAIConfig, prompt string) (string, error) {
	provider := strings.ToLower(strings.TrimSpace(ai.Provider))
	if provider == "lmstudio" {
		return a.requestLMStudioSpellCheck(ctx, ai, prompt)
	}
	return a.requestOpenAISpellCheck(ctx, ai, prompt)
}

func (a *App) requestOpenAISpellCheck(ctx context.Context, ai TranslationAIConfig, prompt string) (string, error) {
	base := normalizeAIEndpointBase(ai.Endpoint)
	endpoint := strings.TrimRight(base, "/") + "/v1/chat/completions"
	payload := map[string]any{
		"model": ai.Model,
		"messages": []map[string]string{
			{"role": "system", "content": "You are a precise multilingual proofreading engine that returns strict JSON only."},
			{"role": "user", "content": prompt},
		},
		"stream": true,
		"store":  false,
	}
	if ai.Temperature > 0 {
		payload["temperature"] = ai.Temperature
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return a.doOpenAIChatStream(ctx, endpoint, ai.Key, body, 300*time.Second, "spellcheck")
}

func (a *App) requestLMStudioSpellCheck(ctx context.Context, ai TranslationAIConfig, prompt string) (string, error) {
	base := normalizeAIEndpointBase(ai.Endpoint)
	endpoint := strings.TrimRight(base, "/") + "/api/v1/chat"
	payload := map[string]any{
		"model":  ai.Model,
		"input":  "You are a precise multilingual proofreading engine that returns strict JSON only.\n\n" + prompt,
		"stream": true,
		"store":  false,
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
				a.appendLMStudioStreamContent(raw, &output, "spellcheck")
			}
		}
		if err == io.EOF {
			if len(eventData) > 0 {
				joined := strings.Join(eventData, "\n")
				eventData = nil
				var raw map[string]any
				if json.Unmarshal([]byte(joined), &raw) == nil {
					a.appendLMStudioStreamContent(raw, &output, "spellcheck")
				}
			}
			break
		}
	}
	return output.String(), nil
}

func parseSpellCheckSuggestions(raw string) ([]SpellCheckSuggestion, error) {
	cleaned := strings.TrimSpace(stripMarkdownFence(raw))
	if start := strings.Index(cleaned, "{"); start > 0 {
		cleaned = cleaned[start:]
	}
	if !json.Valid([]byte(cleaned)) {
		cleaned = completeJSONClosers(cleaned)
	}
	if !json.Valid([]byte(cleaned)) {
		if strings.HasPrefix(cleaned, "{\"suggestions\":[") && strings.HasSuffix(cleaned, "]") {
			cleaned += "}"
		}
	}
	if !json.Valid([]byte(cleaned)) && strings.HasPrefix(cleaned, "{") {
		if end := strings.LastIndex(cleaned, "}"); end >= 0 && end < len(cleaned)-1 {
			cleaned = cleaned[:end+1]
		}
	}
	if end := strings.LastIndex(cleaned, "}"); json.Valid([]byte(cleaned)) && end >= 0 && end < len(cleaned)-1 {
		cleaned = cleaned[:end+1]
	}

	var parsed SpellCheckResult
	if err := json.Unmarshal([]byte(cleaned), &parsed); err != nil {
		var suggestions []SpellCheckSuggestion
		if arrayErr := json.Unmarshal([]byte(cleaned), &suggestions); arrayErr == nil {
			return suggestions, nil
		}
		return nil, fmt.Errorf("failed to parse spellcheck response: %w", err)
	}
	return parsed.Suggestions, nil
}

func completeJSONClosers(value string) string {
	var stack []rune
	inString := false
	escaped := false
	for _, r := range value {
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if r == '\\' {
				escaped = true
				continue
			}
			if r == '"' {
				inString = false
			}
			continue
		}
		switch r {
		case '"':
			inString = true
		case '{', '[':
			stack = append(stack, r)
		case '}':
			if len(stack) > 0 && stack[len(stack)-1] == '{' {
				stack = stack[:len(stack)-1]
			}
		case ']':
			if len(stack) > 0 && stack[len(stack)-1] == '[' {
				stack = stack[:len(stack)-1]
			}
		}
	}
	if len(stack) == 0 {
		return value
	}
	var repaired strings.Builder
	repaired.WriteString(value)
	for index := len(stack) - 1; index >= 0; index-- {
		if stack[index] == '{' {
			repaired.WriteRune('}')
		} else {
			repaired.WriteRune(']')
		}
	}
	return repaired.String()
}

func normalizeSpellCheckSuggestions(content string, suggestions []SpellCheckSuggestion) []SpellCheckSuggestion {
	if len(suggestions) == 0 {
		return nil
	}

	contentLen := utf16Length(content)
	normalized := make([]SpellCheckSuggestion, 0, len(suggestions))
	seen := map[string]bool{}
	for _, suggestion := range suggestions {
		suggestion.Reason = strings.TrimSpace(suggestion.Reason)
		if strings.TrimSpace(suggestion.Original) == "" || strings.TrimSpace(suggestion.Replacement) == "" || suggestion.Original == suggestion.Replacement {
			continue
		}
		if suggestion.Start < 0 || suggestion.End <= suggestion.Start || suggestion.End > contentLen {
			continue
		}
		key := fmt.Sprintf("%d:%d:%s", suggestion.Start, suggestion.End, suggestion.Replacement)
		if seen[key] {
			continue
		}
		seen[key] = true
		normalized = append(normalized, suggestion)
	}

	sort.SliceStable(normalized, func(i, j int) bool {
		if normalized[i].Start == normalized[j].Start {
			return normalized[i].End < normalized[j].End
		}
		return normalized[i].Start < normalized[j].Start
	})
	return normalized
}

func utf16Length(text string) int {
	length := 0
	for _, r := range text {
		if r <= utf8.RuneSelf {
			length++
			continue
		}
		if r <= 0xFFFF {
			length++
		} else {
			length += 2
		}
	}
	return length
}
