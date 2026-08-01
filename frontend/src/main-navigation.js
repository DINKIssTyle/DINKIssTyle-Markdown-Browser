/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import {
    state, el, HOME_SCREEN_PATH, ABOUT_PATH, FEATURES_PATH, SHORTCUTS_PATH, THIRD_PARTY_NOTICES_PATH, WHATS_NEW_PATH,
    getPathDirname, normalizeFileURLPath, normalizeAppLocalFileHref,
    documentTypeFromPath, kindFromPath, splitLinkTarget, isExternalURL,
    joinPath, getScroller, syncEngineSelector, deriveTabTitle,
    isMacOS, isEditableTarget, isBundledDocumentPath, isActiveMarkdownEditTab,
    isSupportedPreviewPath, getLocalizedBundledDocument,
} from './main-state.js';
import { getActiveTab, syncTabFromGlobals, renderTabs, createAndSwitchToNewTab, switchToTab, saveCurrentScroll } from './main-tabs.js';
import { renderActiveTab, hideLinkTooltip } from './main-render.js';
import { undoAction, redoAction, getUndoDepth, getRedoDepth, enterEditMode, getEditorSelectionSnapshot } from './main-editor.js';
import {
    showToast, beginProgressTask, updateProgress,
    finishProgressTask, throwIfTaskCancelled, isCancelledTaskError,
} from './main-ui.js';
import { OpenFile, ReadFile, OpenExternalPath, OpenExternalURL, AskConfirm, TouchRecentFile } from '../wailsjs/go/app/App';
import { BrowserOpenURL, LogError, LogInfo } from '../wailsjs/runtime/runtime';
import { createHorizontalSwipeTracker, HISTORY_BACK, HISTORY_FORWARD } from './history-input.mjs';

// ── Module-level State ─────────────────────────────────────
let lastHistoryMouseTrigger = { button: -1, timeStamp: -1 };
let lastHistoryGestureTrigger = Number.NEGATIVE_INFINITY;
const historyInputTargets = new WeakSet();
const nativeHistoryTargets = new WeakSet();
const NATIVE_HISTORY_EVENT = 'dkst:native-history-navigation';
const HISTORY_GESTURE_DEDUP_MS = 500;

// ── File Opening ───────────────────────────────────────────

export async function handleOpenFile() {
    const result = await OpenFile();
    if (result && result.path) {
        await openPath(result.path, {
            pushHistory: true,
            setHome: true,
            content: result.content,
            newTab: shouldOpenAdditionalFileInNewTab(),
        });
    }
}

export async function openIncomingFiles(paths) {
    if (!Array.isArray(paths) || paths.length === 0) {
        return;
    }

    const firstFileNeedsNewTab = shouldOpenAdditionalFileInNewTab();

    for (let index = 0; index < paths.length; index++) {
        const path = paths[index];
        if (!path) continue;

        await openPath(path, {
            pushHistory: true,
            setHome: true,
            newTab: firstFileNeedsNewTab || index > 0,
        });
    }
}

export function shouldOpenAdditionalFileInNewTab() {
    return state.currentFilePath !== HOME_SCREEN_PATH;
}

export async function openPath(path, options = {}) {
    const {
        pushHistory = true,
        setHome = false,
        content = null,
        newTab = false,
        keyword = "",
        anchor = "",
        tabId = state.activeTabId,
        openInEditMode = false,
    } = options;
    hideLinkTooltip();
    path = normalizeFileURLPath(path);

    if (newTab) {
        await createAndSwitchToNewTab(path, { pushHistory: false, setHome, content, keyword, anchor, openInEditMode });
        return;
    }

    if (tabId && tabId !== state.activeTabId) {
        await switchToTab(tabId);
    }

    const tab = getActiveTab();
    if (!tab) return;
    const targetTabId = tab.id;
    tab.pendingKeyword = keyword;
    tab.pendingAnchor = anchor;
    state.pendingKeyword = keyword;
    state.pendingAnchor = anchor;

    const shouldShowProgress = path !== HOME_SCREEN_PATH;
    const taskId = shouldShowProgress ? beginProgressTask('Loading document', 18) : 0;

    try {
        if (path === HOME_SCREEN_PATH) {
            if (!isLiveTab(tab)) return;
            if (isActiveTab(tab)) {
                if (pushHistory) pushCurrentHistory(path);
                state.currentFilePath = HOME_SCREEN_PATH;
                state.currentFolder = "";
                state.currentMarkdownSource = "";
                syncTabFromGlobals(tab);
            } else {
                applyHomeToTab(tab, pushHistory);
            }
            renderTabs();
            if (isActiveTab(tab)) {
                await renderActiveTab();
            }
            return;
        }

        if (isBundledDocumentPath(path)) {
            updateProgress('Loading bundled document', 42);
            const bundled = await loadBundledMarkdown(path);
            throwIfTaskCancelled(taskId);
            updateProgress('Rendering document', 82);
            const { yieldToUI } = await import('./main-ui.js');
            await yieldToUI();
            throwIfTaskCancelled(taskId);
            if (!isLiveTab(tab)) return;
            await loadFile(path, bundled, pushHistory, false, tab);
            return;
        }

        const documentType = documentTypeFromPath(path);
        const shouldReadContent = documentType === 'markdown';
        let fileContent = content ?? "";
        if (shouldReadContent) {
            updateProgress('Reading markdown file', 42);
            fileContent = await ReadFile(path);
        } else {
            updateProgress('Preparing preview', 42);
        }
        throwIfTaskCancelled(taskId);
        updateProgress('Rendering document', 82);
        const { yieldToUI } = await import('./main-ui.js');
        await yieldToUI();
        throwIfTaskCancelled(taskId);
        if (!isLiveTab(tab)) return;
        await loadFile(path, fileContent, pushHistory, setHome, tab);
        if (!isLiveTab(tab)) return;
        if (openInEditMode && documentType === 'markdown' && state.activeTabId === targetTabId) {
            enterEditMode();
        } else if (openInEditMode && documentType === 'markdown') {
            tab.isEditing = true;
            tab.editorOriginalContent = fileContent;
            tab.editingSourcePath = path;
            tab.editingSourceFolder = getPathDirname(path);
        }
    } catch (err) {
        if (isCancelledTaskError(err)) {
            return;
        }
        console.error("openPath failed:", err);
        LogError(`openPath failed path=${path} anchor=${anchor}: ${err?.message || err}`);
        if (String(err?.message || err).includes('is a directory')) {
            await openExternalPath(path);
            return;
        }
        showToast(err?.message || "Failed to open file.");
    } finally {
        if (shouldShowProgress) {
            finishProgressTask(taskId);
        }
    }
}

// ── History ────────────────────────────────────────────────

function pushCurrentHistory(path) {
    saveCurrentScroll();
    if (state.navIndex < state.navHistory.length - 1) {
        state.navHistory = state.navHistory.slice(0, state.navIndex + 1);
    }
    state.navHistory.push({ path, scroll: 0 });
    state.navIndex++;
}

function pushTabHistory(tab, path) {
    const history = (tab.navHistory || [{ path: tab.path, scroll: 0 }]).map(item => ({ ...item }));
    let index = typeof tab.navIndex === "number" ? tab.navIndex : history.length - 1;
    if (index < history.length - 1) {
        history.splice(index + 1);
    }
    history.push({ path, scroll: 0 });
    tab.navHistory = history;
    tab.navIndex = index + 1;
}

export function updateNavButtons() {
    const backBtnIcon = el.btnBack.querySelector('.material-symbols-outlined');
    const forwardBtnIcon = el.btnForward.querySelector('.material-symbols-outlined');
    const isEditNavMode = isActiveMarkdownEditTab();

    if (isEditNavMode) {
        // Change to Undo/Redo
        if (backBtnIcon) backBtnIcon.textContent = 'undo';
        if (forwardBtnIcon) forwardBtnIcon.textContent = 'redo';

        const undoKey = isMacOS() ? '⌘Z' : 'Ctrl+Z';
        const redoKey = isMacOS() ? '⌘⇧Z' : 'Ctrl+Y';
        el.btnBack.title = `Undo (${undoKey})`;
        el.btnForward.title = `Redo (${redoKey})`;

        el.btnBack.disabled = getUndoDepth() === 0;
        el.btnForward.disabled = getRedoDepth() === 0;
        el.btnHome.disabled = true;
        if (el.btnTranslate) {
            el.btnTranslate.disabled = true;
        }
        return;
    }

    // Restore to Back/Forward
    if (backBtnIcon) backBtnIcon.textContent = 'arrow_back';
    if (forwardBtnIcon) forwardBtnIcon.textContent = 'arrow_forward';

    el.btnBack.title = 'Back';
    el.btnForward.title = 'Forward';

    el.btnBack.disabled = state.navIndex <= 0;
    el.btnForward.disabled = state.navIndex >= state.navHistory.length - 1;
    el.btnHome.disabled = false;
}

export function goBack() {
    if (isActiveMarkdownEditTab()) {
        undoAction();
        return;
    }
    if (state.navIndex > 0) {
        saveCurrentScroll();
        state.navIndex--;
        const entry = state.navHistory[state.navIndex];
        openPath(entry.path, { pushHistory: false });
    }
}

export function goForward() {
    if (isActiveMarkdownEditTab()) {
        redoAction();
        return;
    }
    if (state.navIndex < state.navHistory.length - 1) {
        saveCurrentScroll();
        state.navIndex++;
        const entry = state.navHistory[state.navIndex];
        openPath(entry.path, { pushHistory: false });
    }
}

export function goHome() {
    if (isActiveMarkdownEditTab()) return;
    openPath(state.homeTargetPath);
}

// ── File Loading ───────────────────────────────────────────

async function loadFile(path, content, pushHistory = true, setHome = false, tab = getActiveTab()) {
    if (!tab || !isLiveTab(tab)) {
        return;
    }
    const documentType = documentTypeFromPath(path);
    const isTargetActive = isActiveTab(tab);

    if (!isTargetActive) {
        tab.path = path;
        tab.kind = kindFromPath(path);
        tab.documentType = documentType;
        tab.currentFolder = getPathDirname(path);
        tab.currentMarkdownSource = documentType === 'markdown' ? content : "";
        tab.editorSelection = (tab.editorSelections || {})[path] || null;
        tab.pendingKeyword = tab.pendingKeyword || "";
        tab.pendingAnchor = tab.pendingAnchor || "";
        if (setHome && !isBundledDocumentPath(path)) {
            tab.homeTargetPath = path;
        }
        if (pushHistory) {
            pushTabHistory(tab, path);
        }
        tab.title = deriveTabTitle(path, content);
        touchRecentPreviewPath(path);
        renderTabs();
        return;
    }

    if (state.isEditing) {
        const previousSelectionKey = state.editingSourcePath || state.currentFilePath;
        const previousSelection = getEditorSelectionSnapshot() || state.editorSelection;
        if (previousSelectionKey && previousSelection) {
            tab.editorSelections = tab.editorSelections || {};
            tab.editorSelections[previousSelectionKey] = previousSelection;
        }
    }

    state.currentFilePath = path;
    state.currentDocumentType = documentType;
    state.currentFolder = getPathDirname(path);
    state.currentMarkdownSource = state.currentDocumentType === 'markdown' ? content : "";
    if (tab) {
        tab.editorSelections = tab.editorSelections || {};
        state.editorSelection = tab.editorSelections[path] || null;
    }
    syncEngineSelector();

    touchRecentPreviewPath(path);

    if (setHome && !isBundledDocumentPath(path)) {
        state.homeTargetPath = path;
    }

    if (pushHistory) {
        pushCurrentHistory(path);
    }

    if (tab) {
        syncTabFromGlobals(tab);
        tab.title = deriveTabTitle(path, content);
        renderTabs();
    }

    await renderActiveTab();
}

function isActiveTab(tab) {
    return !!tab && tab.id === state.activeTabId;
}

function isLiveTab(tab) {
    return !!tab && state.tabs.some(item => item.id === tab.id);
}

function applyHomeToTab(tab, pushHistory) {
    if (pushHistory) {
        pushTabHistory(tab, HOME_SCREEN_PATH);
    }
    tab.path = HOME_SCREEN_PATH;
    tab.kind = kindFromPath(HOME_SCREEN_PATH);
    tab.documentType = documentTypeFromPath(HOME_SCREEN_PATH);
    tab.currentFolder = "";
    tab.currentMarkdownSource = "";
    tab.title = 'Start';
}

function touchRecentPreviewPath(path) {
    if (!isBundledDocumentPath(path) && isSupportedPreviewPath(path)) {
        TouchRecentFile(path).catch(error => {
            LogError(`TouchRecentFile failed path=${path}: ${error?.message || error}`);
        });
    }
}

export async function reloadCurrent() {
    const tab = getActiveTab();
    if (!tab) return;
    const reloadPath = state.currentFilePath;
    const reloadDocumentType = state.currentDocumentType;
    if (reloadPath === HOME_SCREEN_PATH) {
        await renderActiveTab();
        return;
    }

    const taskId = beginProgressTask('Refreshing document', 24);

    try {
        let nextContent = "";
        if (isBundledDocumentPath(reloadPath)) {
            updateProgress('Loading bundled document', 48);
            nextContent = await loadBundledMarkdown(reloadPath);
            throwIfTaskCancelled(taskId);
            updateProgress('Rendering document', 82);
            const { yieldToUI } = await import('./main-ui.js');
            await yieldToUI();
            throwIfTaskCancelled(taskId);
            await applyReloadedContent(tab, reloadPath, 'markdown', nextContent);
            return;
        }

        if (reloadDocumentType === 'markdown') {
            updateProgress('Reading markdown file', 48);
            nextContent = await ReadFile(reloadPath);
            throwIfTaskCancelled(taskId);
        } else {
            updateProgress('Preparing preview', 48);
            nextContent = "";
        }
        updateProgress('Rendering document', 82);
        const { yieldToUI } = await import('./main-ui.js');
        await yieldToUI();
        throwIfTaskCancelled(taskId);
        await applyReloadedContent(tab, reloadPath, reloadDocumentType, nextContent);
    } catch (error) {
        if (isCancelledTaskError(error)) {
            return;
        }
        LogError(`reloadCurrent failed path=${reloadPath}: ${error?.message || error}`);
        showToast(error?.message || 'Failed to refresh file.');
    } finally {
        finishProgressTask(taskId);
    }
}

async function applyReloadedContent(tab, path, documentType, content) {
    if (!isLiveTab(tab)) {
        return;
    }
    if (!isActiveTab(tab)) {
        tab.currentMarkdownSource = documentType === 'markdown' ? content : "";
        if (tab.path === path) {
            tab.title = deriveTabTitle(path, content);
        }
        renderTabs();
        return;
    }
    state.currentMarkdownSource = documentType === 'markdown' ? content : "";
    syncTabFromGlobals(tab);
    await renderActiveTab();
}

export async function openThirdPartyNotices(newTab = false) {
    await openPath(THIRD_PARTY_NOTICES_PATH, { newTab });
}

export async function openShortcuts(newTab = false) {
    await openPath(getPreferredLocalizedBundledPath('shortcuts', SHORTCUTS_PATH), { newTab });
}

export async function openFeatures(newTab = false) {
    await openPath(getPreferredLocalizedBundledPath('features', FEATURES_PATH), { newTab });
}

export async function openAbout(newTab = false) {
    await openPath(getPreferredLocalizedBundledPath('about', ABOUT_PATH), { newTab });
}

export async function openWhatsNew(newTab = false) {
    await openPath(getPreferredLocalizedBundledPath('whatsNew', WHATS_NEW_PATH), { newTab });
}

function getPreferredLocalizedBundledPath(key, fallbackPath) {
    const document = getLocalizedBundledDocument(key);
    if (!document) {
        return fallbackPath;
    }

    const languages = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];

    for (const language of languages) {
        const normalized = String(language || '').replace('_', '-').toLowerCase();
        const exactMatch = document.paths[normalized];
        if (exactMatch) {
            return exactMatch;
        }

        const baseMatch = document.paths[normalized.split('-')[0]];
        if (baseMatch) {
            return baseMatch;
        }
    }

    return document.defaultPath || fallbackPath;
}

async function loadBundledMarkdown(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load bundled markdown: ${path}`);
    }
    return await response.text();
}

// ── Link Resolution ────────────────────────────────────────

export function resolveLink(rel, options = {}) {
    const { pathPart, anchor } = splitLinkTarget(rel);

    if (!pathPart && anchor) {
        state.pendingAnchor = anchor;
        import('./main-render.js').then(mod => mod.scrollToAnchor(anchor));
        return;
    }

    const normalizedPathPart = normalizeAppLocalFileHref(pathPart) || pathPart;
    const fileURLPath = normalizeFileURLPath(normalizedPathPart);
    const resolvedPath = fileURLPath.startsWith('/')
        ? fileURLPath
        : resolveRelativeDocumentLink(fileURLPath);
    LogInfo(`markdown link href=${rel} resolved=${resolvedPath} anchor=${anchor || ""} newTab=${!!options.newTab}`);
    openPath(resolvedPath, { ...options, anchor });
}

function resolveRelativeDocumentLink(path) {
    if (isBundledDocumentPath(state.currentFilePath)) {
        return `/${path.replace(/^\/+/, '')}`;
    }
    return joinPath(state.currentFolder, path);
}

export async function confirmAndOpenExternalLink(href) {
    LogInfo(`external link click href=${href}`);
    try {
        const ok = await AskConfirm("External Link", "Open in your system browser?\n\n" + href, "Open", "Cancel");
        LogInfo(`external link confirm href=${href} ok=${ok}`);
        if (ok) {
            LogInfo(`external link dispatch href=${href}`);
            await openExternalURL(href);
        }
    } catch (error) {
        LogError(`external link confirm failed href=${href}: ${error?.message || error}`);
    }
}

export async function openExternalPath(path) {
    try {
        LogInfo(`external path request path=${path}`);
        await OpenExternalPath(path);
        LogInfo(`external path success path=${path}`);
    } catch (error) {
        LogError(`external path fallback failed path=${path}: ${error?.message || error}`);
        showToast('Failed to open path in Finder.');
    }
}

export async function openExternalURL(href) {
    try {
        LogInfo(`external url request href=${href}`);
        await OpenExternalURL(href);
        LogInfo(`external url success href=${href}`);
    } catch (error) {
        LogError(`external url fallback failed href=${href}: ${error?.message || error}`);
        LogInfo(`external url runtime fallback href=${href}`);
        BrowserOpenURL(href);
    }
}

// ── Mouse History Navigation ───────────────────────────────

export function bindHistoryMouseNavigation(target) {
    if (!target || historyInputTargets.has(target)) return;
    historyInputTargets.add(target);

    ['mousedown', 'mouseup', 'pointerup'].forEach(type => {
        target.addEventListener(type, handleGlobalHistoryMouseEvent, true);
    });

    if (isMacOS()) {
        const swipeTracker = createHorizontalSwipeTracker();
        target.addEventListener('wheel', event => handleHistorySwipeWheel(event, swipeTracker), {
            capture: true,
            passive: false,
        });
    }
}

export function bindNativeHistoryNavigation(target = window) {
    if (!target || nativeHistoryTargets.has(target)) return;
    nativeHistoryTargets.add(target);
    target.addEventListener(NATIVE_HISTORY_EVENT, handleNativeHistoryNavigation);
}

function handleHistoryMouseButton(event) {
    if (isEditableTarget(event.target)) {
        return false;
    }

    const historyButton = getHistoryMouseButton(event);
    if (!historyButton) {
        return false;
    }

    // WKWebView does not reliably expose auxiliary mouse buttons as DOM events.
    // The AppKit bridge translates them into NATIVE_HISTORY_EVENT instead.
    if (isMacOS() && (historyButton === 3 || historyButton === 4)) {
        return false;
    }

    if (lastHistoryMouseTrigger.button === historyButton && Math.abs(event.timeStamp - lastHistoryMouseTrigger.timeStamp) < 250) {
        event.preventDefault();
        event.stopPropagation();
        return true;
    }
    lastHistoryMouseTrigger = {
        button: historyButton,
        timeStamp: event.timeStamp,
    };

    event.preventDefault();
    event.stopPropagation();

    if (historyButton === 3) {
        goBack();
        return true;
    }

    goForward();
    return true;
}

function getHistoryMouseButton(event) {
    if (event.button === 3 || event.button === 4) {
        return event.button;
    }

    if (typeof event.buttons === 'number') {
        if (event.buttons & 8) {
            return 3;
        }
        if (event.buttons & 16) {
            return 4;
        }
    }

    return 0;
}

function handleGlobalHistoryMouseEvent(event) {
    handleHistoryMouseButton(event);
}

function handleNativeHistoryNavigation(event) {
    const direction = event?.detail?.direction;
    if (direction !== HISTORY_BACK && direction !== HISTORY_FORWARD) return;
    performViewerHistoryNavigation(direction, event.detail.source !== 'mouse');
}

function handleHistorySwipeWheel(event, swipeTracker) {
    if (isActiveMarkdownEditTab() || isEditableTarget(event.target) || event.ctrlKey) {
        swipeTracker.reset();
        return;
    }

    if (canScrollHorizontally(event.target, event.deltaX)) {
        swipeTracker.reset();
        return;
    }

    const direction = swipeTracker.update(event.deltaX, event.deltaY, event.timeStamp);
    if (!direction) return;

    event.preventDefault();
    event.stopPropagation();
    performViewerHistoryNavigation(direction, true);
}

function performViewerHistoryNavigation(direction, deduplicateGesture = false) {
    if (isActiveMarkdownEditTab()) {
        return false;
    }

    if (deduplicateGesture) {
        const now = performance.now();
        if (now - lastHistoryGestureTrigger < HISTORY_GESTURE_DEDUP_MS) {
            return true;
        }
        lastHistoryGestureTrigger = now;
    }

    if (direction === HISTORY_BACK) {
        goBack();
    } else {
        goForward();
    }
    return true;
}

function canScrollHorizontally(target, deltaX) {
    if (!target || !deltaX) return false;

    const ownerDocument = target.ownerDocument || document;
    let node = target.nodeType === 1 ? target : target.parentElement;
    while (node) {
        const maxScrollLeft = node.scrollWidth - node.clientWidth;
        if (maxScrollLeft > 1) {
            if (deltaX < 0 && node.scrollLeft > 1) return true;
            if (deltaX > 0 && node.scrollLeft < maxScrollLeft - 1) return true;
        }
        if (node === ownerDocument.documentElement) break;
        node = node.parentElement;
    }
    return false;
}
