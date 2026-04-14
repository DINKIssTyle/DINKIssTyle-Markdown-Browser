/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

// ── Constants ──────────────────────────────────────────────
export const HOME_SCREEN_PATH = '__home__';
export const THIRD_PARTY_NOTICES_PATH = '/THIRD-PARTY-NOTICES.md';
export const WHATS_NEW_PATH = '/WHATS-NEW.md';

// ── DOM Helpers ────────────────────────────────────────────
export const $ = id => document.getElementById(id);
export const getScroller = () => document.getElementById('content-view');

// ── Cached DOM Element References ──────────────────────────
export const el = {
    currentPath: $('current-path'),
    tabsList: $('tabs-list'),
    btnNewTab: $('btn-new-tab'),
    homeScreen: $('home-screen'),
    recentList: $('recent-files-list'),
    markdownContainer: $('markdown-container'),
    editPreviewReturn: $('edit-preview-return'),
    htmlFrame: $('html-frame'),
    searchSidebar: $('search-sidebar'),
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
    btnOpenHome: $('btn-open-home'),
    btnClearRecent: $('btn-clear-recent'),
    btnInfo: $('btn-info'),
    btnFontMinus: $('btn-font-minus'),
    btnFontPlus: $('btn-font-plus'),
    btnThemeToggle: $('btn-theme-toggle'),
    btnSearchToggle: $('btn-search-toggle'),
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
    edStrike: $('ed-strike'),
    edQuote: $('ed-quote'),
    edH1: $('ed-h1'),
    edH2: $('ed-h2'),
    edH3: $('ed-h3'),
    edUl: $('ed-ul'),
    edOl: $('ed-ol'),
    edHr: $('ed-hr'),
    edLink: $('ed-link'),
    edImage: $('ed-image'),
    edCode: $('ed-code'),
    edTable: $('ed-table'),
    edTask: $('ed-task'),
    edLatex: $('ed-latex'),
    edEmoji: $('ed-emoji'),
    edFontMinus: $('ed-font-minus'),
    edFontPlus: $('ed-font-plus'),
    edCancel: $('ed-cancel'),
    edSave: $('ed-save'),
    btnNewDoc: $('btn-new-doc'),
    edDiv: $('ed-div'),
    edFim: $('ed-fim'),
    edSettings: $('ed-settings'),
    aiSettingsModal: $('ai-settings-modal'),
    aiGeneralEnabled: $('ai-general-enabled'),
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
    aiFimEnabled: $('ai-fim-enabled'),
    aiFimEndpoint: $('ai-fim-endpoint'),
    aiFimModel: $('ai-fim-model'),
    aiFimKey: $('ai-fim-key'),
    aiFimTemp: $('ai-fim-temp'),
    aiSettingsCancel: $('ai-settings-cancel'),
    aiSettingsSave: $('ai-settings-save'),
    aiFloatingBtn: $('ai-floating-btn'),
    aiPromptBox: $('ai-prompt-box'),
    aiPromptInput: $('ai-prompt-input'),
    aiPromptSend: $('ai-prompt-send'),
    aiPromptClose: $('ai-prompt-close'),
    contentView: $('content-view'),
    modalOverlay: $('modal-overlay'),
    modalTitle: $('modal-title'),
    modalMessage: $('modal-message'),
    modalInputGroup: $('modal-input-group'),
    modalInput: $('modal-input'),
    modalOptionGrid: $('modal-option-grid'),
    modalEmojiGrid: $('modal-emoji-grid'),
    modalBtnOk: $('modal-btn-ok'),
    modalBtnCancel: $('modal-btn-cancel'),
    aiProgressOverlay: $('ai-progress-overlay'),
    aiProgressLabel: $('ai-progress-label'),
    aiProgressPercent: $('ai-progress-percent'),
    aiProgressBarFill: $('ai-progress-bar-fill'),
    aiToggleImeFix: $('ai-toggle-ime-fix'),
    appVersionFooter: $('app-version-footer'),
    footerWhatsNew: $('footer-whats-new'),
};

// ── Shared Mutable State ───────────────────────────────────
// 모든 모듈이 동일한 객체 참조를 공유하여 상태 동기화를 보장합니다.
export const state = {
    currentFilePath: "",
    currentFolder: "",
    navHistory: [],
    navIndex: -1,
    homeTargetPath: HOME_SCREEN_PATH,
    currentFontSize: 16,
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
    koreanImeFixEnabled: false,
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
    return /\.html?$/i.test(path) ? 'html' : 'markdown';
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
    if (path === WHATS_NEW_PATH) return 'WHATS-NEW.md';
    return path;
}

export function deriveTabTitle(path, content) {
    if (path === HOME_SCREEN_PATH) return 'Start';
    if (path === THIRD_PARTY_NOTICES_PATH) return 'Open Source Notices';
    if (path === WHATS_NEW_PATH) return "What's New";
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

export function splitLinkTarget(href) {
    const hashIndex = href.indexOf('#');
    if (hashIndex === -1) {
        return { pathPart: href, anchor: "" };
    }
    return {
        pathPart: href.slice(0, hashIndex),
        anchor: decodeURIComponent(href.slice(hashIndex + 1)),
    };
}

export function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export function isBundledDocumentPath(path) {
    return path === THIRD_PARTY_NOTICES_PATH || path === WHATS_NEW_PATH;
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

    state.currentEngine = state.currentMarkdownEngine;
    el.selectEngine.value = state.currentMarkdownEngine;
    el.selectEngine.disabled = false;
}
