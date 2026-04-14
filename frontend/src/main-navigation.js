/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import {
    state, el, HOME_SCREEN_PATH, THIRD_PARTY_NOTICES_PATH,
    getPathDirname, normalizeFileURLPath, normalizeAppLocalFileHref,
    documentTypeFromPath, splitLinkTarget, isExternalURL,
    joinPath, getScroller, syncEngineSelector, deriveTabTitle,
    isMacOS, isEditableTarget,
} from './main-state.js';
import { getActiveTab, syncTabFromGlobals, renderTabs, createAndSwitchToNewTab, switchToTab, saveCurrentScroll } from './main-tabs.js';
import { renderActiveTab } from './main-render.js';
import {
    showToast, beginProgressTask, updateProgress,
    finishProgressTask, throwIfTaskCancelled, isCancelledTaskError,
} from './main-ui.js';
import { OpenFile, ReadFile, OpenExternalPath, OpenExternalURL, AskConfirm } from '../wailsjs/go/main/App';
import { BrowserOpenURL, LogError, LogInfo } from '../wailsjs/runtime/runtime';

// ── Module-level State ─────────────────────────────────────
let lastHistoryMouseTrigger = { button: -1, timeStamp: -1 };

// ── File Opening ───────────────────────────────────────────

export async function handleOpenFile() {
    const result = await OpenFile();
    if (result && result.path) {
        // 스타트 페이지가 아닌 탭에서는 항상 새 탭으로 열기
        const forceNewTab = state.currentFilePath !== HOME_SCREEN_PATH;
        await openPath(result.path, { pushHistory: true, setHome: true, content: result.content, newTab: forceNewTab });
    }
}

export async function openIncomingFiles(paths) {
    if (!Array.isArray(paths) || paths.length === 0) {
        return;
    }

    for (let index = 0; index < paths.length; index++) {
        const path = paths[index];
        if (!path) continue;

        await openPath(path, {
            pushHistory: true,
            setHome: true,
            newTab: index > 0,
        });
    }
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
    } = options;
    path = normalizeFileURLPath(path);

    if (newTab) {
        await createAndSwitchToNewTab(path, { pushHistory: false, setHome, content, keyword, anchor });
        return;
    }

    if (tabId && tabId !== state.activeTabId) {
        await switchToTab(tabId);
    }

    state.pendingKeyword = keyword;
    state.pendingAnchor = anchor;
    const tab = getActiveTab();
    if (!tab) return;

    const shouldShowProgress = path !== HOME_SCREEN_PATH;
    const taskId = shouldShowProgress ? beginProgressTask('Loading document', 18) : 0;

    try {
        if (path === HOME_SCREEN_PATH) {
            if (pushHistory) pushCurrentHistory(path);
            state.currentFilePath = HOME_SCREEN_PATH;
            state.currentFolder = "";
            state.currentMarkdownSource = "";
            syncTabFromGlobals(tab);
            tab.title = 'Start';
            renderTabs();
            await renderActiveTab();
            return;
        }

        if (path === THIRD_PARTY_NOTICES_PATH) {
            updateProgress('Loading bundled document', 42);
            const bundled = await loadBundledMarkdown(path);
            throwIfTaskCancelled(taskId);
            updateProgress('Rendering document', 82);
            const { yieldToUI } = await import('./main-ui.js');
            await yieldToUI();
            throwIfTaskCancelled(taskId);
            await loadFile(path, bundled, pushHistory, false);
            return;
        }

        updateProgress('Reading markdown file', 42);
        const fileContent = content ?? await ReadFile(path);
        throwIfTaskCancelled(taskId);
        updateProgress('Rendering document', 82);
        const { yieldToUI } = await import('./main-ui.js');
        await yieldToUI();
        throwIfTaskCancelled(taskId);
        await loadFile(path, fileContent, pushHistory, setHome);
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

export function updateNavButtons() {
    if (state.isEditing) {
        el.btnBack.disabled = true;
        el.btnForward.disabled = true;
        el.btnHome.disabled = true;
        return;
    }
    el.btnBack.disabled = state.navIndex <= 0;
    el.btnForward.disabled = state.navIndex >= state.navHistory.length - 1;
    el.btnHome.disabled = false;
}

export function goBack() {
    if (state.isEditing) return;
    if (state.navIndex > 0) {
        saveCurrentScroll();
        state.navIndex--;
        const entry = state.navHistory[state.navIndex];
        openPath(entry.path, { pushHistory: false });
    }
}

export function goForward() {
    if (state.isEditing) return;
    if (state.navIndex < state.navHistory.length - 1) {
        saveCurrentScroll();
        state.navIndex++;
        const entry = state.navHistory[state.navIndex];
        openPath(entry.path, { pushHistory: false });
    }
}

export function goHome() {
    if (state.isEditing) return;
    openPath(state.homeTargetPath);
}

// ── File Loading ───────────────────────────────────────────

async function loadFile(path, content, pushHistory = true, setHome = false) {
    state.currentFilePath = path;
    state.currentDocumentType = documentTypeFromPath(path);
    state.currentFolder = getPathDirname(path);
    state.currentMarkdownSource = content;
    syncEngineSelector();

    if (setHome && path !== THIRD_PARTY_NOTICES_PATH) {
        state.homeTargetPath = path;
    }

    if (pushHistory) {
        pushCurrentHistory(path);
    }

    const tab = getActiveTab();
    if (tab) {
        syncTabFromGlobals(tab);
        tab.title = deriveTabTitle(path, content);
        renderTabs();
    }

    await renderActiveTab();
}

export async function reloadCurrent() {
    const tab = getActiveTab();
    if (!tab) return;
    if (state.currentFilePath === HOME_SCREEN_PATH) {
        await renderActiveTab();
        return;
    }

    const taskId = beginProgressTask('Refreshing document', 24);

    try {
        if (state.currentFilePath === THIRD_PARTY_NOTICES_PATH) {
            updateProgress('Loading bundled document', 48);
            state.currentMarkdownSource = await loadBundledMarkdown(state.currentFilePath);
            throwIfTaskCancelled(taskId);
            syncTabFromGlobals(tab);
            updateProgress('Rendering document', 82);
            const { yieldToUI } = await import('./main-ui.js');
            await yieldToUI();
            throwIfTaskCancelled(taskId);
            await renderActiveTab();
            return;
        }

        updateProgress('Reading markdown file', 48);
        state.currentMarkdownSource = await ReadFile(state.currentFilePath);
        throwIfTaskCancelled(taskId);
        syncTabFromGlobals(tab);
        updateProgress('Rendering document', 82);
        const { yieldToUI } = await import('./main-ui.js');
        await yieldToUI();
        throwIfTaskCancelled(taskId);
        await renderActiveTab();
    } catch (error) {
        if (isCancelledTaskError(error)) {
            return;
        }
        LogError(`reloadCurrent failed path=${state.currentFilePath}: ${error?.message || error}`);
        showToast(error?.message || 'Failed to refresh file.');
    } finally {
        finishProgressTask(taskId);
    }
}

export async function openThirdPartyNotices(newTab = false) {
    await openPath(THIRD_PARTY_NOTICES_PATH, { newTab });
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
    const resolvedPath = fileURLPath.startsWith('/') ? fileURLPath : joinPath(state.currentFolder, fileURLPath);
    LogInfo(`markdown link href=${rel} resolved=${resolvedPath} anchor=${anchor || ""} newTab=${!!options.newTab}`);
    openPath(resolvedPath, { ...options, anchor });
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
    ['mousedown', 'mouseup', 'pointerup'].forEach(type => {
        target.addEventListener(type, handleGlobalHistoryMouseEvent, true);
    });
}

function handleHistoryMouseButton(event) {
    if (isEditableTarget(event.target)) {
        return false;
    }

    const historyButton = getHistoryMouseButton(event);
    if (!historyButton) {
        return false;
    }

    // macOS에서는 Native Bridge가 이 버튼들을 처리하므로 프런트엔드 직접 감지는 건너뜁니다.
    // (WebKit Webview는 이 버튼들을 신뢰성 있게 전달하지 못하기 때문입니다)
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
