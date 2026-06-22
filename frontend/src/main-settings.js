/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state } from './main-state.js';
import { SaveSettings } from '../wailsjs/go/app/App';

export function buildSettingsPayload(overrides = {}) {
    return {
        theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
        lightAccentColor: state.lightAccentColor,
        darkAccentColor: state.darkAccentColor,
        fontSize: state.currentFontSize,
        engine: state.currentMarkdownEngine,
        editorRenderMode: state.currentEditorRenderMode,
        editorToolbarMode: state.editorToolbarMode,
        editorPreviewScrollSync: state.editorPreviewScrollSyncEnabled,
        editorOrderedListStyle: state.editorOrderedListStyle,
        editorTokenColorsEnabled: state.editorTokenColorsEnabled,
        editorTokenColors: state.editorTokenColors,
        editorBackgroundColor: state.editorBackgroundColor,
        fileTreeFilterEnabled: state.fileTreeFilterEnabled,
        documentMargin: state.documentMargin,
        recentFileDisplayLimit: state.recentFileDisplayLimit,
        outlineHeadingFormat: state.outlineHeadingFormatEnabled,
        aiFeaturesDisabled: state.aiFeaturesDisabled,
        aiGeneralEnabled: window.aiState?.generalAvailable ?? true,
        aiGeneralToolbarEnabled: window.aiState?.generalToolbarEnabled ?? true,
        aiToolbarCollapsed: state.aiToolbarCollapsed,
        aiGeneralProvider: window.aiState?.generalProvider || "openai",
        aiGeneralEndpoint: window.aiState?.generalEndpoint || "",
        aiGeneralModel: window.aiState?.generalModel || "gemma-4-e4b-it",
        aiGeneralKey: window.aiState?.generalKey || "",
        aiGeneralTemp: window.aiState?.generalTemp || 0,
        aiFimEnabled: window.aiState?.fimAvailable ?? true,
        aiFimToolbarEnabled: window.aiState?.fimEnabled ?? false,
        aiFimEndpoint: window.aiState?.fimEndpoint || "",
        aiFimModel: window.aiState?.fimModel || "qwen2.5-coder-0.5b-instruct-mlx",
        aiFimKey: window.aiState?.fimKey || "",
        aiFimTemp: window.aiState?.fimTemp || 0,
        aiSelectionContext: state.aiSelectionContextEnabled,
        aiGithubCompatible: state.aiGithubCompatibleEnabled,
        aiSupportAgent: state.aiSupportAgentEnabled,
        koreanImeEnterFix: state.koreanImeFixEnabled,
        lastVersion: state.lastVersion,
        ...overrides,
    };
}

export async function persistAppSettings(overrides = {}) {
    await SaveSettings(buildSettingsPayload(overrides));
}
