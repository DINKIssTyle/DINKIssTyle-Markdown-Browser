/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el } from './main-state.js';
import { SaveSettings } from '../wailsjs/go/app/App';

const MAIN_TOOLBAR_BUTTONS = [
    ['newDocument', 'mainToolbarNewDocument', 'settingsToolbarNewDocument', ['btnNewDoc']],
    ['edit', 'mainToolbarEdit', 'settingsToolbarEdit', ['btnEdit']],
    ['translate', 'mainToolbarTranslate', 'settingsToolbarTranslate', ['btnTranslate']],
    ['fontSize', 'mainToolbarFontSize', 'settingsToolbarFontSize', ['btnFontMinus', 'btnFontPlus']],
    ['theme', 'mainToolbarTheme', 'settingsToolbarTheme', ['btnThemeToggle']],
];

export function loadMainToolbarVisibility(settings = {}) {
    MAIN_TOOLBAR_BUTTONS.forEach(([stateKey, settingKey]) => {
        state.mainToolbarButtons[stateKey] = settings[settingKey] !== false;
    });
    applyMainToolbarVisibility();
}

export function syncMainToolbarSettingsControls() {
    MAIN_TOOLBAR_BUTTONS.forEach(([stateKey, , controlKey]) => {
        if (el[controlKey]) {
            el[controlKey].checked = state.mainToolbarButtons[stateKey] !== false;
        }
    });
}

export function collectMainToolbarSettingsFromControls() {
    MAIN_TOOLBAR_BUTTONS.forEach(([stateKey, , controlKey]) => {
        if (el[controlKey]) {
            state.mainToolbarButtons[stateKey] = el[controlKey].checked;
        }
    });
}

export function applyMainToolbarVisibility() {
    MAIN_TOOLBAR_BUTTONS.forEach(([stateKey, , , elementKeys]) => {
        elementKeys.forEach(elementKey => {
            el[elementKey]?.classList.toggle('hidden', state.mainToolbarButtons[stateKey] === false);
        });
    });
}

export function buildSettingsPayload(overrides = {}) {
    return {
        theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
        lightAccentColor: state.lightAccentColor,
        darkAccentColor: state.darkAccentColor,
        mainToolbarNewDocument: state.mainToolbarButtons.newDocument,
        mainToolbarEdit: state.mainToolbarButtons.edit,
        mainToolbarTranslate: state.mainToolbarButtons.translate,
        mainToolbarFontSize: state.mainToolbarButtons.fontSize,
        mainToolbarTheme: state.mainToolbarButtons.theme,
        fontSize: state.currentFontSize,
        engine: state.currentMarkdownEngine,
        editorRenderMode: state.currentEditorRenderMode,
        editorToolbarMode: state.editorToolbarMode,
        editorAuthor: state.editorAuthor,
        editorPreviewScrollSync: state.editorPreviewScrollSyncEnabled,
        editorOrderedListStyle: state.editorOrderedListStyle,
        editorTokenColorsEnabled: state.editorTokenColorsEnabled,
        editorTokenColors: state.editorTokenColors,
        editorBackgroundColor: state.editorBackgroundColor,
        fileTreeFilterEnabled: state.fileTreeFilterEnabled,
        documentMargin: state.documentMargin,
        viewerFontFamily: state.viewerFontFamily,
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
        updateCheckInterval: state.updateCheckInterval,
        lastUpdateCheck: state.lastUpdateCheck,
        ...overrides,
    };
}

export async function persistAppSettings(overrides = {}) {
    await SaveSettings(buildSettingsPayload(overrides));
}
