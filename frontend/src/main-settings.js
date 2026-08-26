/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el } from './main-state.js';
import { SaveSettings } from '../bindings/dinkisstyle-markdown-browser/internal/app/app';
import { normalizeThemeMode } from './main-theme.js';

const MAIN_TOOLBAR_BUTTONS = [
    ['newDocument', 'mainToolbarNewDocument', 'settingsToolbarNewDocument', ['btnNewDoc'], true],
    ['edit', 'mainToolbarEdit', 'settingsToolbarEdit', ['btnEdit'], true],
    ['translate', 'mainToolbarTranslate', 'settingsToolbarTranslate', ['btnTranslate'], true],
    ['fontSize', 'mainToolbarFontSize', 'settingsToolbarFontSize', ['btnFontMinus', 'btnFontPlus'], true],
    ['theme', 'mainToolbarTheme', 'settingsToolbarTheme', ['btnThemeToggle'], false],
];

const SCROLLBAR_VISIBILITY_VALUES = new Set(['when-scrolling', 'always']);
const SCROLLBAR_TARGET_SELECTOR = '#content-view, .cm-scroller';
const SCROLLBAR_ACTIVE_CLASS = 'is-scrollbar-active';
const SCROLLBAR_IDLE_DELAY_MS = 750;
const scrollbarHideTimers = new Map();
let scrollbarActivityBound = false;

export function loadThemeMode(settings = {}) {
    state.themeMode = normalizeThemeMode(settings.themeMode || settings.theme);
}

export function syncThemeSettingsControls() {
    if (!el.settingsThemeMode) return;
    el.settingsThemeMode.value = normalizeThemeMode(state.themeMode);
    if (el.settingsThemeModeSegmented) {
        el.settingsThemeModeSegmented.querySelectorAll('button[data-theme-value]').forEach(button => {
            const isActive = button.dataset.themeValue === state.themeMode;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
    }
}

export function collectThemeSettingsFromControls() {
    state.themeMode = normalizeThemeMode(el.settingsThemeMode?.value);
}

export function normalizeScrollbarVisibility(value) {
    return SCROLLBAR_VISIBILITY_VALUES.has(value) ? value : 'always';
}

function clearScrollbarActivity(target) {
    const timer = scrollbarHideTimers.get(target);
    if (timer) {
        window.clearTimeout(timer);
        scrollbarHideTimers.delete(target);
    }
    target.classList.remove(SCROLLBAR_ACTIVE_CLASS);
}

function showScrollbarWhileScrolling(target) {
    if (state.scrollbarVisibility !== 'when-scrolling' || !target?.matches?.(SCROLLBAR_TARGET_SELECTOR)) {
        return;
    }

    const existingTimer = scrollbarHideTimers.get(target);
    if (existingTimer) {
        window.clearTimeout(existingTimer);
    }
    target.classList.add(SCROLLBAR_ACTIVE_CLASS);
    scrollbarHideTimers.set(target, window.setTimeout(() => {
        target.classList.remove(SCROLLBAR_ACTIVE_CLASS);
        scrollbarHideTimers.delete(target);
    }, SCROLLBAR_IDLE_DELAY_MS));
}

const customScrollbarTimers = new WeakMap();

function triggerScrollbarActive(scrollbarEl) {
    if (!scrollbarEl) return;
    const existing = customScrollbarTimers.get(scrollbarEl);
    if (existing) clearTimeout(existing);
    scrollbarEl.classList.add('is-active');
    customScrollbarTimers.set(scrollbarEl, setTimeout(() => {
        scrollbarEl.classList.remove('is-active');
        customScrollbarTimers.delete(scrollbarEl);
    }, SCROLLBAR_IDLE_DELAY_MS));
}

export function updateCustomVerticalScrollbars(activeTarget = null) {
    if (!document.documentElement.classList.contains('platform-mobile')) return;
    if (document.documentElement.classList.contains('is-sidebar-transitioning')) return;
    if (window.innerWidth <= 768 && el.appSidebar && !el.appSidebar.classList.contains('hidden')) {
        el.contentViewScrollbar?.classList.remove('is-overflowing', 'is-active');
        el.editorViewScrollbar?.classList.remove('is-overflowing', 'is-active');
        return;
    }
    if (!el.documentArea) return;

    const docRect = el.documentArea.getBoundingClientRect();
    if (docRect.width <= 0 || docRect.height <= 0) return;

    // 1. Content View (Viewer)
    const isContentVisible = el.contentView &&
        el.contentViewScrollbar &&
        !el.contentView.classList.contains('hidden') &&
        !el.documentArea?.classList.contains('editor-preview-hidden') &&
        el.contentView.offsetParent !== null &&
        el.contentView.clientHeight > 0;

    if (isContentVisible) {
        const rect = el.contentView.getBoundingClientRect();
        const clientHeight = el.contentView.clientHeight;
        const scrollHeight = el.contentView.scrollHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (maxScroll > 4 && clientHeight > 0) {
            el.contentViewScrollbar.style.left = `${rect.right - docRect.left - 5}px`;
            el.contentViewScrollbar.style.top = `${rect.top - docRect.top + 2}px`;
            el.contentViewScrollbar.style.height = `${rect.height - 4}px`;

            const thumb = el.contentViewScrollbar.firstElementChild;
            if (thumb) {
                const thumbRatio = Math.max(0.06, Math.min(1, clientHeight / scrollHeight));
                const thumbHeightPx = Math.max(28, (rect.height - 4) * thumbRatio);
                const scrollTop = Math.max(0, Math.min(maxScroll, el.contentView.scrollTop));
                const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
                const maxTranslate = (rect.height - 4) - thumbHeightPx;
                const translateY = progress * maxTranslate;

                thumb.style.height = `${thumbHeightPx}px`;
                thumb.style.transform = `translateY(${translateY}px)`;
            }
            el.contentViewScrollbar.classList.add('is-overflowing');
            if (activeTarget === el.contentView && state.scrollbarVisibility === 'when-scrolling') {
                triggerScrollbarActive(el.contentViewScrollbar);
            }
        } else {
            el.contentViewScrollbar.classList.remove('is-overflowing', 'is-active');
        }
    } else if (el.contentViewScrollbar) {
        el.contentViewScrollbar.classList.remove('is-overflowing', 'is-active');
    }

    // 2. Editor View (CodeMirror Scroller)
    const cmScroller = el.editorView?.querySelector('.cm-scroller');
    const isEditorVisible = el.editorView &&
        el.editorViewScrollbar &&
        !el.editorView.classList.contains('hidden') &&
        el.editorView.offsetParent !== null &&
        el.editorView.clientHeight > 0 &&
        cmScroller;

    if (isEditorVisible) {
        const rect = el.editorView.getBoundingClientRect();
        const clientHeight = cmScroller.clientHeight;
        const scrollHeight = cmScroller.scrollHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (maxScroll > 4 && clientHeight > 0) {
            el.editorViewScrollbar.style.left = `${rect.right - docRect.left - 5}px`;
            el.editorViewScrollbar.style.top = `${rect.top - docRect.top + 2}px`;
            el.editorViewScrollbar.style.height = `${rect.height - 4}px`;

            const thumb = el.editorViewScrollbar.firstElementChild;
            if (thumb) {
                const thumbRatio = Math.max(0.06, Math.min(1, clientHeight / scrollHeight));
                const thumbHeightPx = Math.max(28, (rect.height - 4) * thumbRatio);
                const scrollTop = Math.max(0, Math.min(maxScroll, cmScroller.scrollTop));
                const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
                const maxTranslate = (rect.height - 4) - thumbHeightPx;
                const translateY = progress * maxTranslate;

                thumb.style.height = `${thumbHeightPx}px`;
                thumb.style.transform = `translateY(${translateY}px)`;
            }
            el.editorViewScrollbar.classList.add('is-overflowing');
            if (activeTarget === cmScroller && state.scrollbarVisibility === 'when-scrolling') {
                triggerScrollbarActive(el.editorViewScrollbar);
            }
        } else {
            el.editorViewScrollbar.classList.remove('is-overflowing', 'is-active');
        }
    } else if (el.editorViewScrollbar) {
        el.editorViewScrollbar.classList.remove('is-overflowing', 'is-active');
    }
}

function bindScrollbarActivity() {
    if (scrollbarActivityBound) return;
    scrollbarActivityBound = true;
    document.addEventListener('scroll', event => {
        showScrollbarWhileScrolling(event.target);
        updateCustomVerticalScrollbars(event.target);
    }, true);
    window.addEventListener('resize', () => updateCustomVerticalScrollbars(), { passive: true });
    window.addEventListener('app:viewport-change', () => updateCustomVerticalScrollbars(), { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
        const areaObserver = new ResizeObserver(() => updateCustomVerticalScrollbars());
        if (el.documentArea) areaObserver.observe(el.documentArea);
        if (el.contentView) areaObserver.observe(el.contentView);
        if (el.editorView) areaObserver.observe(el.editorView);
    }
}

export function applyScrollbarVisibility() {
    state.scrollbarVisibility = normalizeScrollbarVisibility(state.scrollbarVisibility);
    document.documentElement.dataset.scrollbarVisibility = state.scrollbarVisibility;
    document.querySelectorAll(SCROLLBAR_TARGET_SELECTOR).forEach(clearScrollbarActivity);
    updateCustomVerticalScrollbars();
}

export function loadScrollbarVisibility(settings = {}) {
    state.scrollbarVisibility = normalizeScrollbarVisibility(settings.scrollbarVisibility);
    bindScrollbarActivity();
    applyScrollbarVisibility();
}

export function syncScrollbarSettingsControls() {
    if (!el.settingsScrollbarVisibility) return;
    el.settingsScrollbarVisibility.value = normalizeScrollbarVisibility(state.scrollbarVisibility);
}

export function collectScrollbarSettingsFromControls() {
    state.scrollbarVisibility = normalizeScrollbarVisibility(el.settingsScrollbarVisibility?.value);
}

export function loadMainToolbarVisibility(settings = {}) {
    MAIN_TOOLBAR_BUTTONS.forEach(([stateKey, settingKey, , , defaultVisible]) => {
        const persistedValue = settings[settingKey];
        state.mainToolbarButtons[stateKey] = typeof persistedValue === 'boolean'
            ? persistedValue
            : defaultVisible;
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

const MOBILE_MENU_ACTION_MAP = {
    newDocument: ['new-doc'],
    edit: ['edit'],
    translate: ['translate'],
    fontSize: ['font-minus', 'font-plus'],
    theme: ['theme'],
};

export function applyMainToolbarVisibility() {
    MAIN_TOOLBAR_BUTTONS.forEach(([stateKey, , , elementKeys]) => {
        const isVisible = state.mainToolbarButtons[stateKey] !== false;
        elementKeys.forEach(elementKey => {
            el[elementKey]?.classList.toggle('hidden', !isVisible);
        });

        const mobileActions = MOBILE_MENU_ACTION_MAP[stateKey];
        if (mobileActions) {
            mobileActions.forEach(action => {
                const item = document.querySelector(`.mobile-menu-item[data-action="${action}"]`);
                item?.classList.toggle('hidden', !isVisible);
            });
        }
    });
}

export function buildSettingsPayload(overrides = {}) {
    return {
        theme: state.themeMode,
        themeMode: state.themeMode,
        lightAccentColor: state.lightAccentColor,
        darkAccentColor: state.darkAccentColor,
        scrollbarVisibility: normalizeScrollbarVisibility(state.scrollbarVisibility),
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
