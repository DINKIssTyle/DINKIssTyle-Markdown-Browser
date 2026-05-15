/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { DEFAULT_CONTENT_FONT_SIZE } from './config.js';

// ── Constants ──────────────────────────────────────────────
export const HOME_SCREEN_PATH = '__home__';
export const ABOUT_PATH = '/ABOUT.md';
export const FEATURES_PATH = '/FEATURES.md';
export const SHORTCUTS_PATH = '/SHORTCUTS.md';
export const THIRD_PARTY_NOTICES_PATH = '/THIRD-PARTY-NOTICES.md';
export const WHATS_NEW_PATH = '/WHATS-NEW.md';
export const LOCALIZED_BUNDLED_DOCUMENTS = Object.freeze({
    about: Object.freeze({
        defaultPath: ABOUT_PATH,
        title: 'About',
        paths: Object.freeze({}),
    }),
    features: Object.freeze({
        defaultPath: FEATURES_PATH,
        title: 'Features',
        paths: Object.freeze({
            'ko': '/FEATURES-ko-KR.md',
            'ko-kr': '/FEATURES-ko-KR.md',
            'es': '/FEATURES-es-ES.md',
            'es-es': '/FEATURES-es-ES.md',
            'zh': '/FEATURES-zh-CN.md',
            'zh-cn': '/FEATURES-zh-CN.md',
            'ja': '/FEATURES-ja-JP.md',
            'ja-jp': '/FEATURES-ja-JP.md',
        }),
    }),
    shortcuts: Object.freeze({
        defaultPath: SHORTCUTS_PATH,
        title: 'Shortcuts',
        paths: Object.freeze({}),
    }),
    whatsNew: Object.freeze({
        defaultPath: WHATS_NEW_PATH,
        title: "What's New",
        paths: Object.freeze({
            'ko': '/WHATS-NEW-ko-KR.md',
            'ko-kr': '/WHATS-NEW-ko-KR.md',
            'es': '/WHATS-NEW-es-ES.md',
            'es-es': '/WHATS-NEW-es-ES.md',
            'zh': '/WHATS-NEW-zh-CN.md',
            'zh-cn': '/WHATS-NEW-zh-CN.md',
            'ja': '/WHATS-NEW-ja-JP.md',
            'ja-jp': '/WHATS-NEW-ja-JP.md',
        }),
    }),
});
export const LOCALIZED_BUNDLED_DOCUMENT_PATHS = Object.freeze([
    ...new Set(Object.values(LOCALIZED_BUNDLED_DOCUMENTS).flatMap(document => [
        document.defaultPath,
        ...Object.values(document.paths),
    ])),
]);

// ── DOM Helpers ────────────────────────────────────────────
export const $ = id => document.getElementById(id);
export const getScroller = () => document.getElementById('content-view');

// ── Cached DOM Element References ──────────────────────────
export const el = {
    startupSplash: $('startup-splash'),
    currentPath: $('current-path'),
    tabsList: $('tabs-list'),
    btnNewTab: $('btn-new-tab'),
    homeScreen: $('home-screen'),
    recentList: $('recent-files-list'),
    btnOpenHome: $('btn-open-home'),
    btnClearRecent: $('btn-clear-recent'),
    markdownContainer: $('markdown-container'),
    editPreviewReturn: $('edit-preview-return'),
    editPreviewOpenTab: $('edit-preview-open-tab'),
    htmlFrame: $('html-frame'),
    searchInput: $('search-input'),
    btnClearSearch: $('btn-clear-search'),
    searchOpenTabFolders: $('search-open-tab-folders'),
    searchResults: $('search-results'),
    selectEngine: $('select-engine'),
    btnBack: $('btn-back'),
    btnForward: $('btn-forward'),
    btnHome: $('btn-home'),
    btnRefresh: $('btn-refresh'),
    btnOpen: $('btn-open'),
    btnPrint: $('btn-print'),
    btnFontMinus: $('btn-font-minus'),
    btnFontPlus: $('btn-font-plus'),
    btnThemeToggle: $('btn-theme-toggle'),
    btnSidebarToggle: $('btn-sidebar-toggle'),
    appSidebar: $('app-sidebar'),
    sidebarResizer: $('sidebar-resizer'),
    sidebarTabFiles: $('sidebar-tab-files'),
    sidebarTabOutline: $('sidebar-tab-outline'),
    sidebarTabSearch: $('sidebar-tab-search'),
    sidebarPanelFiles: $('sidebar-panel-files'),
    sidebarPanelOutline: $('sidebar-panel-outline'),
    sidebarPanelSearch: $('sidebar-panel-search'),
    fileTree: $('file-tree'),
    markdownOutline: $('markdown-outline'),
    highlightNav: $('highlight-nav'),
    btnHlPrev: $('btn-hl-prev'),
    btnHlNext: $('btn-hl-next'),
    btnHlClose: $('btn-hl-close'),
    hlCounter: $('hl-counter'),
    toast: $('toast'),
    progressWidget: $('progress-widget'),
    progressTitle: $('progress-title'),
    progressValue: $('progress-value'),
    progressFill: $('progress-fill'),
    btnProgressCancel: $('btn-progress-cancel'),
    contextMenu: $('context-menu'),
    contextCut: $('context-cut'),
    contextCopy: $('context-copy'),
    contextPaste: $('context-paste'),
    contextSelectAll: $('context-select-all'),
    contextSearch: $('context-search'),
    contextOpen: $('context-open'),
    contextOpenNewTab: $('context-open-new-tab'),
    mainContainer: $('main-container'),
    btnEdit: $('btn-edit'),
    editToolbar: $('edit-toolbar'),
    editorView: $('editor-view'),
    markdownEditor: $('markdown-editor'),
    edBold: $('ed-bold'),
    edItalic: $('ed-italic'),
    edUnderline: $('ed-underline'),
    edStrike: $('ed-strike'),
    edQuote: $('ed-quote'),
    edH1: $('ed-h1'),
    edH2: $('ed-h2'),
    edH3: $('ed-h3'),
    edHeadingMenu: $('ed-heading-menu'),
    edUl: $('ed-ul'),
    edOl: $('ed-ol'),
    edListMenu: $('ed-list-menu'),
    edHr: $('ed-hr'),
    edLink: $('ed-link'),
    edImage: $('ed-image'),
    edCode: $('ed-code'),
    edTable: $('ed-table'),
    edTask: $('ed-task'),
    edLatex: $('ed-latex'),
    edEmoji: $('ed-emoji'),
    edInsertMenu: $('ed-insert-menu'),
    edMoreMenu: $('ed-more-menu'),
    edFindReplace: $('ed-find-replace'),
    edTranslateDoc: $('ed-translate-doc'),
    edRenderMode: $('ed-render-mode'),
    edRenderModeMenu: $('ed-render-mode-menu'),
    edRenderModeIcon: $('ed-render-mode-icon'),
    edToolbarHidden: $('ed-toolbar-hidden'),
    edFontMinus: $('ed-font-minus'),
    edFontPlus: $('ed-font-plus'),
    edCancel: $('ed-cancel'),
    edSaveAs: $('ed-save-as'),
    edSave: $('ed-save'),
    linkTooltip: $('link-tooltip'),
    btnNewDoc: $('btn-new-doc'),
    edDiv: $('ed-div'),
    edGeneralAi: $('ed-general-ai'),
    editorAiDock: $('editor-ai-dock'),
    editorAiPanel: $('editor-ai-panel'),
    edAiToolbarToggle: $('ed-ai-toolbar-toggle'),
    edGeneralTempControl: $('ed-general-temp-control'),
    edGeneralTempSlider: $('ed-general-temp-slider'),
    edGeneralTempValue: $('ed-general-temp-value'),
    edFim: $('ed-fim'),
    edFimGroup: $('ed-fim-group'),
    edContextPlus: $('ed-context-plus'),
    edContextPlusGroup: $('ed-context-plus-group'),
    edGithubCompatible: $('ed-github-compatible'),

    // Find Bar
    editorFindBar: $('editor-find-bar'),
    editorFindInput: $('editor-find-input'),
    editorFindPrev: $('editor-find-prev'),
    editorFindNext: $('editor-find-next'),
    editorFindCount: $('editor-find-count'),
    editorFindReplaceCheck: $('editor-find-replace-check'),
    editorReplaceRow: $('editor-replace-row'),
    editorReplaceInput: $('editor-replace-input'),
    editorReplaceOne: $('editor-replace-one'),
    editorReplaceAll: $('editor-replace-all'),
    editorFindDone: $('editor-find-done'),
    edGithubCompatibleGroup: $('ed-github-compatible-group'),
    edSupportAgent: $('ed-support-agent'),

    edSupportAgentGroup: $('ed-support-agent-group'),
    edSettings: $('ed-settings'),
    aiSettingsModal: $('ai-settings-modal'),
    settingsTitle: $('settings-title'),
    settingsTabEditor: $('settings-tab-editor'),
    settingsTabAi: $('settings-tab-ai'),
    settingsPanelEditor: $('settings-panel-editor'),
    settingsPanelAi: $('settings-panel-ai'),
    editorPreviewScrollSync: $('editor-preview-scroll-sync'),
    editorOrderedListStyle: $('editor-ordered-list-style'),
    editorToolbarMode: $('editor-toolbar-mode'),
    editorTokenColorsEnabled: $('editor-token-colors-enabled'),
    editorBackgroundColor: $('editor-background-color'),
    editorTokenPresetList: $('editor-token-preset-list'),
    editorTokenColorGrid: $('editor-token-color-grid'),
    aiFeaturesDisabled: $('ai-features-disabled'),
    aiGeneralProvider: $('ai-general-provider'),
    aiGeneralEndpoint: $('ai-general-endpoint'),
    aiGeneralModel: $('ai-general-model'),
    aiGeneralModelPicker: $('ai-general-model-picker'),
    aiGeneralModelTrigger: $('ai-general-model-trigger'),
    aiGeneralModelTriggerLabel: $('ai-general-model-trigger-label'),
    aiGeneralModelPopover: $('ai-general-model-popover'),
    aiGeneralModelStatus: $('ai-general-model-status'),
    aiGeneralModelList: $('ai-general-model-list'),
    aiGeneralKey: $('ai-general-key'),
    aiGeneralTemp: $('ai-general-temp'),
    aiFimEndpoint: $('ai-fim-endpoint'),
    aiFimModel: $('ai-fim-model'),
    aiFimKey: $('ai-fim-key'),
    aiFimTemp: $('ai-fim-temp'),
    aiSettingsCancel: $('ai-settings-cancel'),
    aiSettingsSave: $('ai-settings-save'),
    aiPromptBox: $('ai-prompt-box'),
    aiPromptBadgeIcon: $('ai-prompt-badge-icon'),
    aiPromptInput: $('ai-prompt-input'),
    aiPromptSend: $('ai-prompt-send'),
    aiPromptClose: $('ai-prompt-close'),
    contentView: $('content-view'),
    editorSlashMenu: $('editor-slash-menu'),
    modalOverlay: $('modal-overlay'),
    modalTitle: $('modal-title'),
    modalMessage: $('modal-message'),
    modalInputGroup: $('modal-input-group'),
    modalInput: $('modal-input'),
    modalOptionGrid: $('modal-option-grid'),
    modalLanguageContainer: $('modal-language-container'),
    modalEmojiGrid: $('modal-emoji-grid'),
    modalEmojiCategories: $('modal-emoji-categories'),
    modalEmojiContainer: $('modal-emoji-container'),
    modalTableContainer: $('modal-table-container'),
    modalTableGrid: $('modal-table-grid'),
    modalTableInfo: $('modal-table-info'),
    modalBtnOk: $('modal-btn-ok'),
    modalBtnCancel: $('modal-btn-cancel'),
    systemInstallModal: $('system-install-modal'),
    systemInstallMessage: $('system-install-message'),
    systemInstallRun: $('system-install-run'),
    systemInstallRemove: $('system-install-remove'),
    systemInstallClose: $('system-install-close'),
    aiToggleImeFix: $('ai-toggle-ime-fix'),
    appVersionFooter: $('app-version-footer'),
    footerInstall: $('footer-install'),
    footerInstallDot: $('footer-install-dot'),
    footerFeatures: $('footer-features'),
    footerShortcuts: $('footer-shortcuts'),
    footerThirdPartyNotices: $('footer-third-party-notices'),
    footerWhatsNew: $('footer-whats-new'),
    footerCopyright: $('footer-copyright'),
    btnFileTreeFilter: $('btn-file-tree-filter'),
};

// ── Shared Mutable State ───────────────────────────────────
// 모든 모듈이 동일한 객체 참조를 공유하여 상태 동기화를 보장합니다.
export const state = {
    currentFilePath: "",
    currentFolder: "",
    navHistory: [],
    navIndex: -1,
    homeTargetPath: HOME_SCREEN_PATH,
    currentFontSize: DEFAULT_CONTENT_FONT_SIZE,
    currentEngine: "marked",
    currentMarkdownEngine: "marked",
    currentDocumentType: "markdown",
    currentMarkdownSource: "",
    pendingKeyword: "",
    pendingAnchor: "",
    tabs: [],
    activeTabId: "",
    nextTabID: 1,
    isEditing: false,
    editorOriginalContent: "",
    editingSourcePath: "",
    editingSourceFolder: "",
    editingPreviewPath: "",
    editingPreviewFolder: "",
    currentEditorRenderMode: "realtime",
    editorToolbarMode: "beginner",
    editorPreviewScrollSyncEnabled: true,
    editorOrderedListStyle: "standard",
    editorTokenColorsEnabled: true,
    editorTokenColors: {},
    editorBackgroundColor: "",
    aiFeaturesDisabled: false,
    aiSelectionContextEnabled: false,
    aiGithubCompatibleEnabled: false,
    aiSupportAgentEnabled: false,
    aiToolbarCollapsed: false,
    koreanImeFixEnabled: false,
    lastVersion: "",
    fileTreeFilterEnabled: false,
    outlineHeadingFormatEnabled: false,
};

// ── Pure Utility Functions ─────────────────────────────────

export function getPathDirname(path) {
    if (!path || path === HOME_SCREEN_PATH || isBundledDocumentPath(path)) {
        return "";
    }

    const normalized = path.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

export function joinPath(base, rel) {
    if (!rel) {
        return base || "";
    }

    const normalizedBase = (base || "").replace(/\\/g, '/');
    const normalizedRel = rel.replace(/\\/g, '/');

    if (/^[A-Za-z]:\//.test(normalizedRel) || normalizedRel.startsWith('/')) {
        return normalizedRel;
    }

    const isUnixAbsolute = normalizedBase.startsWith('/');
    const parts = normalizedBase.split('/').filter(Boolean);
    if (/^[A-Za-z]:$/.test(parts[0])) {
        parts[0] = `${parts[0]}/`;
    }

    for (const segment of normalizedRel.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            if (parts.length > 1 || (parts.length === 1 && !/^[A-Za-z]:\/$/.test(parts[0]))) {
                parts.pop();
            }
            continue;
        }
        parts.push(segment);
    }

    if (parts.length === 0) {
        return isUnixAbsolute ? '/' : "";
    }
    if (/^[A-Za-z]:\/$/.test(parts[0])) {
        return `${parts[0]}${parts.slice(1).join('/')}`;
    }
    const joined = parts.join('/');
    return isUnixAbsolute ? `/${joined}` : joined;
}

export function basename(path) {
    const normalized = (path || '').replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || path;
}

export function kindFromPath(path) {
    if (path === HOME_SCREEN_PATH) return 'home';
    if (isBundledDocumentPath(path)) return 'bundled';
    return 'document';
}

export function documentTypeFromPath(path) {
    if (path === HOME_SCREEN_PATH) return 'home';
    if (isBundledDocumentPath(path)) return 'markdown';
    if (isImagePath(path)) return 'image';
    if (/\.html?$/i.test(path)) return 'html';
    if (isMarkdownPath(path) || /\.txt$/i.test(path)) return 'markdown';
    return 'unsupported';
}

export function isMarkdownPath(path) {
    return /\.(md|markdown)$/i.test(path || "");
}

export function isImagePath(path) {
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(path || "");
}

export function isTextPreviewPath(path) {
    return /\.(md|markdown|txt)$/i.test(path || "");
}

export function isSupportedPreviewPath(path) {
    return isTextPreviewPath(path) || /\.html?$/i.test(path || "") || isImagePath(path);
}

export function normalizeFileURLPath(path) {
    if (!path || !/^file:/i.test(path)) {
        return path;
    }

    try {
        const url = new URL(path);
        if (url.protocol !== 'file:') {
            return path;
        }

        const decodedPath = decodeURIComponent(url.pathname || "");
        if (!decodedPath) {
            return path;
        }

        // Windows file URLs may start with /C:/...
        return decodedPath.replace(/^\/([A-Za-z]:\/)/, '$1');
    } catch {
        return path;
    }
}

export function normalizeAppLocalFileHref(href) {
    if (!href) {
        return "";
    }

    try {
        const url = new URL(href);
        const isAppLocal =
            (url.protocol === 'wails:' || url.protocol === 'http:' || url.protocol === 'https:') &&
            /(^|\.)wails\.localhost$/i.test(url.hostname) &&
            url.pathname.startsWith('/localfile/');

        if (!isAppLocal) {
            return "";
        }

        const localPath = decodeURIComponent(url.pathname.slice('/localfile/'.length));
        return localPath.startsWith('/') ? localPath : `/${localPath}`;
    } catch {
        return "";
    }
}

export function isMacOS() {
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    return /mac/i.test(platform);
}

export function isLinux() {
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    return /linux/i.test(platform);
}

export function isEditableTarget(target) {
    if (!target) {
        return false;
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return true;
    }
    return !!target.closest?.('[contenteditable="true"]');
}

export function isExternalURL(href) {
    return /^(https?:|mailto:)/i.test(href);
}

export function formatDisplayPath(path) {
    if (path === HOME_SCREEN_PATH) return 'DKST Markdown Browser';
    if (path === THIRD_PARTY_NOTICES_PATH) return 'THIRD-PARTY-NOTICES.md';
    if (isLocalizedBundledDocumentPath(path)) return basename(path);
    return path;
}

export function deriveTabTitle(path, content) {
    if (path === HOME_SCREEN_PATH) return 'Start';
    if (path === THIRD_PARTY_NOTICES_PATH) return 'Open Source Notices';
    const localizedTitle = getLocalizedBundledDocumentTitle(path);
    if (localizedTitle) return localizedTitle;
    if (documentTypeFromPath(path) === 'html') {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        const title = doc.querySelector('title')?.textContent?.trim();
        return title || basename(path);
    }

    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (heading) return heading;

    const firstLine = content
        .split('\n')
        .map(line => line.trim())
        .find(line => line && !line.startsWith('---'));
    if (firstLine) {
        return firstLine.replace(/^#+\s*/, '').slice(0, 48);
    }
    return basename(path);
}

export function formatSaveDialogMessage(tabTitle, prompt) {
    const title = String(tabTitle || '').trim();
    if (!title) {
        return prompt;
    }
    return `${title}\n\n${prompt}`;
}

export function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function decodeLocalMarkdownPath(path) {
    if (!path) return "";
    try {
        return decodeURIComponent(path);
    } catch {
        try {
            return decodeURI(path);
        } catch {
            return path;
        }
    }
}

export function splitLinkTarget(href) {
    const hashIndex = href.indexOf('#');
    const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
    const anchor = hashIndex === -1 ? "" : decodeURIComponent(href.slice(hashIndex + 1));

    return {
        pathPart: decodeLocalMarkdownPath(rawPath),
        anchor,
    };
}

export function getLocalizedBundledDocument(key) {
    return LOCALIZED_BUNDLED_DOCUMENTS[key] || null;
}

export function getLocalizedBundledDocumentTitle(path) {
    const document = Object.values(LOCALIZED_BUNDLED_DOCUMENTS)
        .find(item => item.defaultPath === path || Object.values(item.paths).includes(path));
    return document?.title || "";
}

export function isLocalizedBundledDocumentPath(path) {
    return LOCALIZED_BUNDLED_DOCUMENT_PATHS.includes(path);
}

export function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export function isBundledDocumentPath(path) {
    return path === THIRD_PARTY_NOTICES_PATH ||
        isLocalizedBundledDocumentPath(path);
}

export function isActiveMarkdownEditTab() {
    return state.isEditing &&
        state.currentDocumentType === 'markdown' &&
        state.currentFilePath !== HOME_SCREEN_PATH &&
        !isBundledDocumentPath(state.currentFilePath);
}

// ── Engine Selector Sync ───────────────────────────────────

export function syncEngineSelector() {
    if (state.currentDocumentType === 'html') {
        state.currentEngine = 'html';
        el.selectEngine.value = 'html';
        el.selectEngine.disabled = true;
        return;
    }

    if (state.currentDocumentType !== 'markdown') {
        el.selectEngine.disabled = true;
        return;
    }

    state.currentEngine = state.currentMarkdownEngine;
    el.selectEngine.value = state.currentMarkdownEngine;
    el.selectEngine.disabled = false;
}
