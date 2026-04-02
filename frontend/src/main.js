/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import './style.css';

import { marked } from 'marked';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkHtml from 'remark-html';

import {
    OpenFile,
    ConfirmOpenExternalURL,
    FrontendReady,
    OpenExternalPath,
    OpenExternalURL,
    ReadFile,
    ReadImageAsDataURL,
    SearchMarkdown,
    GetRecentFiles,
    ClearRecentFiles,
    HandleFileDrop,
    GetSettings,
    SaveSettings,
} from '../wailsjs/go/main/App';
import { BrowserOpenURL, ClipboardGetText, ClipboardSetText, EventsOn, LogError, LogInfo, OnFileDrop } from '../wailsjs/runtime/runtime';

const HOME_SCREEN_PATH = '__home__';
const THIRD_PARTY_NOTICES_PATH = '/THIRD-PARTY-NOTICES.md';

let currentFilePath = "";
let currentFolder = "";
let navHistory = [];
let navIndex = -1;
let homeTargetPath = HOME_SCREEN_PATH;
let currentFontSize = 16;
let currentEngine = "marked";
let currentMarkdownSource = "";

let hlMatches = [];
let hlCurrent = -1;
let pendingKeyword = "";
let pendingAnchor = "";

let recentFilesCache = [];
let tabs = [];
let activeTabId = "";
let nextTabID = 1;
let progressHideTimer = null;
let contextMenuState = null;

const getScroller = () => document.getElementById('content-view');
const $ = id => document.getElementById(id);

const el = {
    currentPath: $('current-path'),
    tabsList: $('tabs-list'),
    btnNewTab: $('btn-new-tab'),
    homeScreen: $('home-screen'),
    recentList: $('recent-files-list'),
    markdownContainer: $('markdown-container'),
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
    contextSearch: $('context-search'),
    contextOpen: $('context-open'),
    contextOpenNewTab: $('context-open-new-tab'),
};

window.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await renderRecentFiles();
    bindToolbar();
    bindHomeScreen();
    bindHighlightNav();
    bindContextMenu();
    setupDragAndDrop();
    bindMenuEvents();

    const initialTab = createTab({ path: HOME_SCREEN_PATH, title: 'Start' });
    tabs = [initialTab];
    activeTabId = initialTab.id;
    syncGlobalsFromTab(initialTab);
    renderTabs();
    await renderActiveTab();
    updateNavButtons();
    await consumeStartupOpenFiles();
});

function getPathDirname(path) {
    if (!path || path === HOME_SCREEN_PATH || path === THIRD_PARTY_NOTICES_PATH) {
        return "";
    }

    const normalized = path.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

function joinPath(base, rel) {
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

function basename(path) {
    const normalized = (path || '').replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || path;
}

function kindFromPath(path) {
    if (path === HOME_SCREEN_PATH) return 'home';
    if (path === THIRD_PARTY_NOTICES_PATH) return 'bundled';
    return 'document';
}

function createTab({ path = HOME_SCREEN_PATH, title = 'New Tab' } = {}) {
    return {
        id: `tab-${nextTabID++}`,
        path,
        kind: kindFromPath(path),
        title,
        navHistory: [{ path, scroll: 0 }],
        navIndex: 0,
        homeTargetPath: path === HOME_SCREEN_PATH ? HOME_SCREEN_PATH : path,
        currentFolder: getPathDirname(path),
        currentMarkdownSource: "",
        pendingKeyword: "",
        pendingAnchor: "",
    };
}

function getActiveTab() {
    return tabs.find(tab => tab.id === activeTabId) || null;
}

function syncTabFromGlobals(tab) {
    if (!tab) return;
    tab.path = currentFilePath;
    tab.kind = kindFromPath(currentFilePath);
    tab.currentFolder = currentFolder;
    tab.currentMarkdownSource = currentMarkdownSource;
    tab.navHistory = navHistory.map(item => ({ ...item }));
    tab.navIndex = navIndex;
    tab.homeTargetPath = homeTargetPath;
    tab.pendingKeyword = pendingKeyword;
    tab.pendingAnchor = pendingAnchor;
}

function syncGlobalsFromTab(tab) {
    if (!tab) return;
    currentFilePath = tab.path;
    currentFolder = tab.currentFolder || getPathDirname(tab.path);
    currentMarkdownSource = tab.currentMarkdownSource || "";
    navHistory = (tab.navHistory || [{ path: tab.path, scroll: 0 }]).map(item => ({ ...item }));
    navIndex = typeof tab.navIndex === "number" ? tab.navIndex : navHistory.length - 1;
    homeTargetPath = tab.homeTargetPath || HOME_SCREEN_PATH;
    pendingKeyword = tab.pendingKeyword || "";
    pendingAnchor = tab.pendingAnchor || "";
}

function saveCurrentScroll() {
    const tab = getActiveTab();
    if (!tab || navIndex < 0 || navIndex >= navHistory.length) {
        return;
    }
    navHistory[navIndex].scroll = getScroller().scrollTop;
    syncTabFromGlobals(tab);
}

async function switchToTab(tabID) {
    const nextTab = tabs.find(tab => tab.id === tabID);
    if (!nextTab || nextTab.id === activeTabId) {
        return;
    }
    saveCurrentScroll();
    activeTabId = nextTab.id;
    syncGlobalsFromTab(nextTab);
    renderTabs();
    await renderActiveTab();
}

function renderTabs() {
    el.tabsList.innerHTML = tabs.map(tab => `
        <div class="tab-item ${tab.id === activeTabId ? 'active' : ''}" data-tab-id="${tab.id}">
            <span class="tab-title">${escapeHTML(tab.title || 'Untitled')}</span>
            <button class="tab-close-btn" data-close-tab="${tab.id}" aria-label="Close Tab">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
        </div>
    `).join('');

    el.tabsList.querySelectorAll('.tab-item').forEach(tabNode => {
        tabNode.addEventListener('click', async event => {
            if (event.target.closest('[data-close-tab]')) {
                return;
            }
            await switchToTab(tabNode.dataset.tabId);
        });
    });

    el.tabsList.querySelectorAll('[data-close-tab]').forEach(button => {
        button.addEventListener('click', event => {
            event.stopPropagation();
            closeTab(button.dataset.closeTab);
        });
    });

    el.tabsList.querySelector('.tab-item.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function closeTab(tabID) {
    const idx = tabs.findIndex(tab => tab.id === tabID);
    if (idx === -1) return;

    const wasActive = tabs[idx].id === activeTabId;
    tabs.splice(idx, 1);

    if (tabs.length === 0) {
        const freshTab = createTab({ path: HOME_SCREEN_PATH, title: 'Start' });
        tabs.push(freshTab);
        activeTabId = freshTab.id;
        syncGlobalsFromTab(freshTab);
        renderTabs();
        renderActiveTab();
        return;
    }

    if (wasActive) {
        const fallback = tabs[Math.max(0, idx - 1)] || tabs[0];
        activeTabId = fallback.id;
        syncGlobalsFromTab(fallback);
        renderTabs();
        renderActiveTab();
        return;
    }

    renderTabs();
}

async function createAndSwitchToNewTab(path = HOME_SCREEN_PATH, options = {}) {
    saveCurrentScroll();
    const tab = createTab({
        path,
        title: path === HOME_SCREEN_PATH ? 'Start' : 'Loading...',
    });
    tabs.push(tab);
    activeTabId = tab.id;
    syncGlobalsFromTab(tab);
    renderTabs();
    await openPath(path, { ...options, pushHistory: false, tabId: tab.id });
}

async function loadSettings() {
    const s = await GetSettings();
    currentFontSize = s.fontSize || 16;
    currentEngine = s.engine || "marked";

    document.documentElement.classList.toggle('dark', s.theme !== "light");
    el.selectEngine.value = currentEngine;
}

async function persist() {
    await SaveSettings({
        theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
        fontSize: currentFontSize,
        engine: currentEngine,
    });
}

async function renderRecentFiles() {
    recentFilesCache = await GetRecentFiles();
    if (!recentFilesCache || recentFilesCache.length === 0) {
        el.recentList.classList.add('empty');
        el.recentList.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined empty-state-icon" aria-hidden="true">history</span>
                <div class="empty-state-title">No recent documents yet</div>
                <div class="empty-state-copy">Open a Markdown file and it will appear here for quick access.</div>
            </div>
        `;
        return;
    }
    el.recentList.classList.remove('empty');
    el.recentList.innerHTML = recentFilesCache.map(f => `
        <div class="recent-item" data-path="${f.path}">
            <span class="recent-name">${f.name}</span>
            <span class="recent-path">${f.path}</span>
        </div>
    `).join('');
}

function bindToolbar() {
    el.btnOpen.onclick = handleOpenFile;
    el.btnBack.onclick = goBack;
    el.btnForward.onclick = goForward;
    el.btnHome.onclick = goHome;
    el.btnRefresh.onclick = reloadCurrent;
    el.btnInfo.onclick = () => openThirdPartyNotices(true);
    el.btnFontMinus.onclick = () => changeFontSize(-2);
    el.btnFontPlus.onclick = () => changeFontSize(2);
    el.btnThemeToggle.onclick = toggleTheme;
    el.btnSearchToggle.onclick = toggleSearch;
    el.btnNewTab.onclick = () => createAndSwitchToNewTab();
    el.selectEngine.onchange = async event => {
        currentEngine = event.target.value;
        await persist();
        await renderActiveTab();
    };
    el.searchInput.addEventListener('input', debounce(handleSearch, 300));
    el.searchInput.addEventListener('input', updateSearchClearButton);
    el.searchInput.addEventListener('keydown', handleSearchInputKeydown);
    el.btnClearSearch.onclick = clearSearchInput;
    el.searchOpenTabFolders.addEventListener('change', () => handleSearch());
    el.btnProgressCancel.onclick = cancelCurrentTask;
    document.addEventListener('keydown', handleGlobalKeydown);
}

function bindHomeScreen() {
    el.btnOpenHome.onclick = handleOpenFile;

    el.btnClearRecent.onclick = async () => {
        await ClearRecentFiles();
        await renderRecentFiles();
    };

    el.recentList.addEventListener('click', event => {
        const item = event.target.closest('.recent-item');
        if (!item) return;
        openPath(item.dataset.path, { pushHistory: true, setHome: true });
    });

    el.searchResults.addEventListener('click', event => {
        const item = event.target.closest('.result-item');
        if (!item) return;
        openPath(item.dataset.path, {
            pushHistory: true,
            keyword: item.dataset.keyword || "",
            newTab: event.metaKey || event.ctrlKey,
        });
    });
}

function bindHighlightNav() {
    el.btnHlNext.addEventListener('click', () => {
        if (hlMatches.length === 0) return;
        const wasLast = hlCurrent === hlMatches.length - 1;
        hlCurrent = (hlCurrent + 1) % hlMatches.length;
        activateHl(hlCurrent);
        updateHlCounter();
        if (wasLast) showToast('Last result. Returning to the start. 🔄');
    });

    el.btnHlPrev.addEventListener('click', () => {
        if (hlMatches.length === 0) return;
        const wasFirst = hlCurrent === 0;
        hlCurrent = (hlCurrent - 1 + hlMatches.length) % hlMatches.length;
        activateHl(hlCurrent);
        updateHlCounter();
        if (wasFirst) showToast('First result. Returning to the end. 🔄');
    });

    el.btnHlClose.addEventListener('click', () => clearHighlight());
}

function bindContextMenu() {
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', event => {
        if (!event.target.closest('#context-menu')) {
            closeContextMenu();
        }
    });
    document.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('blur', closeContextMenu);

    bindContextMenuAction(el.contextCopy, async () => {
        if (!contextMenuState?.selectionText) return;
        await copyTextToClipboard(contextMenuState.selectionText);
        closeContextMenu();
        showToast('Copied selection.');
    });

    bindContextMenuAction(el.contextSearch, async () => {
        if (!contextMenuState?.selectionText) return;
        await searchForQuery(contextMenuState.selectionText);
        closeContextMenu();
    });

    bindContextMenuAction(el.contextOpen, async () => {
        if (!contextMenuState?.linkHref) return;
        await openContextLink(contextMenuState.linkHref, false);
        closeContextMenu();
    });

    bindContextMenuAction(el.contextOpenNewTab, async () => {
        if (!contextMenuState?.linkHref) return;
        await openContextLink(contextMenuState.linkHref, true);
        closeContextMenu();
    });
}

function bindContextMenuAction(element, action) {
    element.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await action();
    });
}

function handleGlobalKeydown(event) {
    if (isEditableTarget(event.target)) {
        return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c') {
        const selectionText = window.getSelection()?.toString().trim() || "";
        if (selectionText) {
            event.preventDefault();
            copyTextToClipboard(selectionText)
                .then(() => showToast('Copied selection.'))
                .catch(error => LogError(`keyboard copy failed: ${error?.message || error}`));
        }
        return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        const active = getActiveTab();
        if (active) {
            closeTab(active.id);
        }
        return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        reloadCurrent().catch(error => LogError(`keyboard refresh failed: ${error?.message || error}`));
        return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        activateTabByShortcut(Number(event.key));
        return;
    }

    if (event.key === 'Escape') {
        closeContextMenu();
    }
}

function handleContextMenu(event) {
    const selectionText = window.getSelection()?.toString().trim() || "";
    const linkNode = event.target.closest('a[href]');
    const inMarkdown = !!event.target.closest('#markdown-container');

    if (!selectionText && !linkNode) {
        closeContextMenu();
        return;
    }

    if (!inMarkdown && !selectionText) {
        closeContextMenu();
        return;
    }

    event.preventDefault();
    const linkHref = linkNode?.getAttribute('href') || "";
    const showLinkActions = !!linkHref;
    const showSelectionActions = !showLinkActions && !!selectionText;
    contextMenuState = {
        selectionText: showSelectionActions ? selectionText : "",
        linkHref,
    };

    el.contextCopy.classList.toggle('hidden', !showSelectionActions);
    el.contextSearch.classList.toggle('hidden', !showSelectionActions);
    el.contextOpen.classList.toggle('hidden', !showLinkActions);
    el.contextOpenNewTab.classList.toggle('hidden', !showLinkActions);

    positionContextMenu(event.clientX, event.clientY);
}

function positionContextMenu(x, y) {
    el.contextMenu.classList.remove('show');
    el.contextMenu.classList.add('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'true');
    el.contextMenu.classList.remove('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'false');

    const menuRect = el.contextMenu.getBoundingClientRect();
    const maxX = window.innerWidth - menuRect.width - 10;
    const maxY = window.innerHeight - menuRect.height - 10;
    el.contextMenu.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
    el.contextMenu.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
    requestAnimationFrame(() => el.contextMenu.classList.add('show'));
}

function closeContextMenu() {
    contextMenuState = null;
    el.contextMenu.classList.remove('show');
    el.contextMenu.classList.add('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'true');
}

async function copyTextToClipboard(text) {
    try {
        const copied = await ClipboardSetText(text);
        if (copied) {
            return;
        }
    } catch (error) {
        LogError(`clipboard runtime copy failed: ${error?.message || error}`);
    }

    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            LogError(`clipboard web copy failed: ${error?.message || error}`);
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

async function searchForQuery(query) {
    const trimmed = query.trim();
    if (!trimmed) return;
    el.searchSidebar.classList.remove('hidden');
    el.searchInput.value = trimmed;
    await handleSearch();
}

async function openContextLink(href, newTab) {
    if (isExternalURL(href)) {
        await openExternalURL(href);
        return;
    }
    resolveLink(href, { newTab });
}

async function openExternalPath(path) {
    try {
        LogInfo(`external path request path=${path}`);
        await OpenExternalPath(path);
        LogInfo(`external path success path=${path}`);
    } catch (error) {
        LogError(`external path fallback failed path=${path}: ${error?.message || error}`);
        showToast('Failed to open path in Finder.');
    }
}

async function openExternalURL(href) {
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

function showProgress(title, progress = null) {
    clearTimeout(progressHideTimer);
    el.progressTitle.textContent = title;
    if (typeof progress === 'number') {
        const clamped = Math.max(0, Math.min(100, progress));
        el.progressValue.textContent = `${clamped}%`;
        el.progressFill.classList.remove('indeterminate');
        el.progressFill.style.width = `${clamped}%`;
    } else {
        el.progressValue.textContent = "";
        el.progressFill.style.width = "";
        el.progressFill.classList.add('indeterminate');
    }
    el.progressWidget.classList.remove('hidden');
    requestAnimationFrame(() => el.progressWidget.classList.add('show'));
}

function hideProgress() {
    clearTimeout(progressHideTimer);
    progressHideTimer = setTimeout(() => {
        el.progressWidget.classList.remove('show');
        setTimeout(() => el.progressWidget.classList.add('hidden'), 250);
    }, 400);
}

function updateProgress(title, progress = null) {
    showProgress(title, progress);
}

async function cancelCurrentTask() {
    hideProgress();
}

async function handleOpenFile() {
    const result = await OpenFile();
    if (result && result.path) {
        await openPath(result.path, { pushHistory: true, setHome: true, content: result.content });
    }
}

async function consumeStartupOpenFiles() {
    const paths = await FrontendReady();
    await openIncomingFiles(paths);
}

async function openIncomingFiles(paths) {
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

async function openPath(path, options = {}) {
    const {
        pushHistory = true,
        setHome = false,
        content = null,
        newTab = false,
        keyword = "",
        anchor = "",
        tabId = activeTabId,
    } = options;

    if (newTab) {
        await createAndSwitchToNewTab(path, { pushHistory: false, setHome, content, keyword, anchor });
        return;
    }

    if (tabId && tabId !== activeTabId) {
        await switchToTab(tabId);
    }

    pendingKeyword = keyword;
    pendingAnchor = anchor;
    const tab = getActiveTab();
    if (!tab) return;

    const shouldShowProgress = path !== HOME_SCREEN_PATH;

    try {
        if (shouldShowProgress) {
            updateProgress('Loading document', 18);
        }

        if (path === HOME_SCREEN_PATH) {
            if (pushHistory) pushCurrentHistory(path);
            currentFilePath = HOME_SCREEN_PATH;
            currentFolder = "";
            currentMarkdownSource = "";
            syncTabFromGlobals(tab);
            tab.title = 'Start';
            renderTabs();
            await renderActiveTab();
            return;
        }

        if (path === THIRD_PARTY_NOTICES_PATH) {
            updateProgress('Loading bundled document', 42);
            const bundled = await loadBundledMarkdown(path);
            updateProgress('Rendering document', 82);
            await loadFile(path, bundled, pushHistory, false);
            return;
        }

        updateProgress('Reading markdown file', 42);
        const fileContent = content ?? await ReadFile(path);
        updateProgress('Rendering document', 82);
        await loadFile(path, fileContent, pushHistory, setHome);
    } catch (err) {
        console.error("openPath failed:", err);
        LogError(`openPath failed path=${path} anchor=${anchor}: ${err?.message || err}`);
        if (String(err?.message || err).includes('is a directory')) {
            await openExternalPath(path);
            return;
        }
        showToast(err?.message || "Failed to open file.");
    } finally {
        if (shouldShowProgress) {
            updateProgress('Done', 100);
            hideProgress();
        }
    }
}

function pushCurrentHistory(path) {
    saveCurrentScroll();
    if (navIndex < navHistory.length - 1) {
        navHistory = navHistory.slice(0, navIndex + 1);
    }
    navHistory.push({ path, scroll: 0 });
    navIndex++;
}

async function openThirdPartyNotices(newTab = false) {
    await openPath(THIRD_PARTY_NOTICES_PATH, { newTab });
}
async function loadBundledMarkdown(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load bundled markdown: ${path}`);
    }
    return await response.text();
}

async function loadFile(path, content, pushHistory = true, setHome = false) {
    currentFilePath = path;
    currentFolder = getPathDirname(path);
    currentMarkdownSource = content;

    if (setHome && path !== THIRD_PARTY_NOTICES_PATH) {
        homeTargetPath = path;
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

async function reloadCurrent() {
    const tab = getActiveTab();
    if (!tab) return;
    if (currentFilePath === HOME_SCREEN_PATH) {
        await renderActiveTab();
        return;
    }

    try {
        updateProgress('Refreshing document', 24);
        if (currentFilePath === THIRD_PARTY_NOTICES_PATH) {
            updateProgress('Loading bundled document', 48);
            currentMarkdownSource = await loadBundledMarkdown(currentFilePath);
            syncTabFromGlobals(tab);
            updateProgress('Rendering document', 82);
            await renderActiveTab();
            return;
        }

        updateProgress('Reading markdown file', 48);
        currentMarkdownSource = await ReadFile(currentFilePath);
        syncTabFromGlobals(tab);
        updateProgress('Rendering document', 82);
        await renderActiveTab();
    } catch (error) {
        LogError(`reloadCurrent failed path=${currentFilePath}: ${error?.message || error}`);
        showToast(error?.message || 'Failed to refresh file.');
    } finally {
        updateProgress('Done', 100);
        hideProgress();
    }
}

function goBack() {
    if (navIndex > 0) {
        saveCurrentScroll();
        navIndex--;
        const entry = navHistory[navIndex];
        openPath(entry.path, { pushHistory: false });
    }
}

function goForward() {
    if (navIndex < navHistory.length - 1) {
        saveCurrentScroll();
        navIndex++;
        const entry = navHistory[navIndex];
        openPath(entry.path, { pushHistory: false });
    }
}

function goHome() {
    openPath(homeTargetPath);
}

function updateNavButtons() {
    el.btnBack.disabled = navIndex <= 0;
    el.btnForward.disabled = navIndex >= navHistory.length - 1;
}

function formatDisplayPath(path) {
    if (path === HOME_SCREEN_PATH) return 'DKST Markdown Browser';
    if (path === THIRD_PARTY_NOTICES_PATH) return 'THIRD-PARTY-NOTICES.md';
    return path;
}

async function renderActiveTab() {
    const tab = getActiveTab();
    if (!tab) return;

    el.currentPath.innerText = formatDisplayPath(currentFilePath);
    updateNavButtons();

    if (currentFilePath === HOME_SCREEN_PATH) {
        await renderHomeScreen();
        return;
    }

    el.homeScreen.classList.add('hidden');
    el.markdownContainer.classList.remove('hidden');
    await renderMarkdown(currentMarkdownSource);

    const saved = navHistory[navIndex]?.scroll ?? 0;
    getScroller().scrollTop = saved;

    if (pendingAnchor) {
        scrollToAnchor(pendingAnchor);
        pendingAnchor = "";
        tab.pendingAnchor = "";
    }

    if (pendingKeyword) {
        const keyword = pendingKeyword;
        pendingKeyword = "";
        tab.pendingKeyword = "";
        applyHighlight(keyword);
    } else {
        clearHighlight();
    }
}

async function renderHomeScreen() {
    await renderRecentFiles();
    clearHighlight();
    el.markdownContainer.classList.add('hidden');
    el.homeScreen.classList.remove('hidden');
    getScroller().scrollTop = navHistory[navIndex]?.scroll ?? 0;
}

function deriveTabTitle(path, content) {
    if (path === HOME_SCREEN_PATH) return 'Start';
    if (path === THIRD_PARTY_NOTICES_PATH) return 'Open Source Notices';

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

async function renderMarkdown(content) {
    let html;
    if (currentEngine === "marked") {
        html = marked.parse(content);
    } else {
        const vf = await unified().use(remarkParse).use(remarkHtml).process(content);
        html = String(vf);
    }
    el.markdownContainer.innerHTML = html;
    postProcess();
}

function postProcess() {
    el.markdownContainer.querySelectorAll('a').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (!href) return;

        const handleLinkNavigation = event => {
            event.preventDefault();
            event.stopPropagation();

            if (href.startsWith('#')) {
                const { anchor: targetAnchor } = splitLinkTarget(href);
                if (targetAnchor) {
                    pendingAnchor = targetAnchor;
                    scrollToAnchor(targetAnchor);
                }
                return;
            }

            if (isExternalURL(href)) {
                void confirmAndOpenExternalLink(href);
                return;
            }

            const wantsNewTab = event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
            resolveLink(href, { newTab: wantsNewTab });
        };

        anchor.addEventListener('click', handleLinkNavigation);
        anchor.addEventListener('auxclick', event => {
            if (event.button === 1) {
                handleLinkNavigation(event);
            }
        });
    });

    el.markdownContainer.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
            const abs = joinPath(currentFolder, src);
            ReadImageAsDataURL(abs)
                .then(dataUrl => {
                    if (dataUrl) img.src = dataUrl;
                })
                .catch(err => console.error(`Failed to load image: ${abs}`, err));
        }
    });

    el.markdownContainer.style.fontSize = `${currentFontSize}px`;
}

async function confirmAndOpenExternalLink(href) {
    LogInfo(`external link click href=${href}`);
    try {
        if (isMacOS()) {
            const ok = await ConfirmOpenExternalURL(href);
            LogInfo(`external link confirm href=${href} ok=${ok} mode=native`);
            if (ok) {
                LogInfo(`external link dispatch href=${href} mode=native`);
                window.setTimeout(() => {
                    void openExternalURL(href);
                }, 0);
            }
            return;
        }

        const ok = window.confirm(`External link detected.\n\nOpen in your system browser?\n${href}`);
        LogInfo(`external link confirm href=${href} ok=${ok} mode=browser`);
        if (ok) {
            LogInfo(`external link dispatch href=${href} mode=browser`);
            await openExternalURL(href);
        }
    } catch (error) {
        LogError(`external link confirm failed href=${href}: ${error?.message || error}`);
    }
}

function resolveLink(rel, options = {}) {
    const { pathPart, anchor } = splitLinkTarget(rel);

    if (!pathPart && anchor) {
        pendingAnchor = anchor;
        scrollToAnchor(anchor);
        return;
    }

    const resolvedPath = pathPart.startsWith('/') ? pathPart : joinPath(currentFolder, pathPart);
    LogInfo(`markdown link href=${rel} resolved=${resolvedPath} anchor=${anchor || ""} newTab=${!!options.newTab}`);
    openPath(resolvedPath, { ...options, anchor });
}

function isExternalURL(href) {
    return /^(https?:|mailto:)/i.test(href);
}

function isMacOS() {
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    return /mac/i.test(platform);
}

function isEditableTarget(target) {
    if (!target) {
        return false;
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return true;
    }
    return !!target.closest?.('[contenteditable="true"]');
}

function activateTabByShortcut(index) {
    if (tabs.length === 0) {
        return;
    }

    const targetIndex = index === 9 ? tabs.length - 1 : index - 1;
    const tab = tabs[targetIndex];
    if (tab) {
        switchToTab(tab.id);
    }
}

function changeFontSize(delta) {
    currentFontSize = Math.min(72, Math.max(10, currentFontSize + delta));
    el.markdownContainer.style.fontSize = `${currentFontSize}px`;
    persist();
}

function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    persist();
}

function toggleSearch() {
    el.searchSidebar.classList.toggle('hidden');
    updateSearchClearButton();
}

async function handleSearch() {
    const query = el.searchInput.value.trim();
    const folders = getSearchFolders();
    if (!query || folders.length === 0) {
        el.searchResults.innerHTML = '<div class="search-hint">Type a search keyword and keep a file open.</div>';
        return;
    }
    el.searchResults.innerHTML = '<div class="search-hint">Searching...</div>';
    const resultGroups = await Promise.all(folders.map(folder => SearchMarkdown(folder, query)));
    const results = mergeSearchResults(resultGroups.flat());
    if (!results || results.length === 0) {
        el.searchResults.innerHTML = '<div class="search-hint">No results found</div>';
        return;
    }
    el.searchResults.innerHTML = results.map(result => `
        <div class="result-item recent-item" data-path="${result.path}" data-keyword="${escapeAttr(query)}">
            <span class="recent-name">${result.name}</span>
            <span class="recent-path">${result.path}</span>
        </div>
    `).join('');
}

function updateSearchClearButton() {
    el.btnClearSearch.classList.toggle('hidden', !el.searchInput.value.trim());
}

function clearSearchInput() {
    el.searchInput.value = "";
    updateSearchClearButton();
    el.searchResults.innerHTML = '<div class="search-hint">Open a file then type to search.</div>';
    el.searchInput.focus();
}

async function handleSearchInputKeydown(event) {
    if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
    }

    const key = event.key.toLowerCase();
    if (!['a', 'c', 'v', 'x'].includes(key)) {
        return;
    }

    if (key === 'a') {
        event.preventDefault();
        el.searchInput.select();
        return;
    }

    const hasSelection = el.searchInput.selectionStart !== el.searchInput.selectionEnd;

    if (key === 'c') {
        if (!hasSelection) {
            return;
        }
        event.preventDefault();
        await copyTextToClipboard(el.searchInput.value.slice(el.searchInput.selectionStart, el.searchInput.selectionEnd));
        return;
    }

    if (key === 'x') {
        if (!hasSelection) {
            return;
        }
        event.preventDefault();
        await copyTextToClipboard(el.searchInput.value.slice(el.searchInput.selectionStart, el.searchInput.selectionEnd));
        el.searchInput.setRangeText("", el.searchInput.selectionStart, el.searchInput.selectionEnd, 'start');
        updateSearchClearButton();
        await handleSearch();
        return;
    }

    if (key === 'v') {
        event.preventDefault();
        try {
            const text = await ClipboardGetText();
            if (typeof text === 'string') {
                el.searchInput.setRangeText(text, el.searchInput.selectionStart, el.searchInput.selectionEnd, 'end');
                updateSearchClearButton();
                await handleSearch();
            }
        } catch (error) {
            LogError(`clipboard paste failed: ${error?.message || error}`);
        }
    }
}

function getSearchFolders() {
    const folders = new Set();

    if (currentFolder) {
        folders.add(currentFolder);
    }

    if (!el.searchOpenTabFolders.checked) {
        return Array.from(folders);
    }

    tabs.forEach(tab => {
        if (tab.kind !== 'document') {
            return;
        }
        const folder = getPathDirname(tab.path);
        if (folder) {
            folders.add(folder);
        }
    });

    return Array.from(folders);
}

function mergeSearchResults(results) {
    const seen = new Set();
    return results
        .filter(result => result?.path)
        .filter(result => {
            if (seen.has(result.path)) {
                return false;
            }
            seen.add(result.path);
            return true;
        })
        .sort((a, b) => a.path.localeCompare(b.path));
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function applyHighlight(keyword) {
    if (!keyword) return;
    clearHighlight();

    const container = el.markdownContainer;
    const regex = new RegExp(escapeRegex(keyword), 'gi');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const tag = node.parentElement?.tagName?.toLowerCase();
            if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    for (let i = textNodes.length - 1; i >= 0; i--) {
        const textNode = textNodes[i];
        if (!regex.test(textNode.nodeValue)) continue;
        regex.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(textNode.nodeValue)) !== null) {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIndex, match.index)));
            }
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = match[0];
            fragment.appendChild(mark);
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < textNode.nodeValue.length) {
            fragment.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIndex)));
        }
        textNode.parentNode.replaceChild(fragment, textNode);
    }

    hlMatches = Array.from(container.querySelectorAll('.search-highlight'));
    if (hlMatches.length === 0) {
        showToast(`Cannot find "${keyword}".`);
        return;
    }

    hlCurrent = 0;
    activateHl(hlCurrent);
    updateHlCounter();
    el.highlightNav.classList.remove('hidden');
}

function clearHighlight() {
    el.markdownContainer.querySelectorAll('.search-highlight').forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent));
    });
    el.markdownContainer.normalize();
    hlMatches = [];
    hlCurrent = -1;
    el.highlightNav.classList.add('hidden');
}

function activateHl(index) {
    hlMatches.forEach((mark, idx) => mark.classList.toggle('active', idx === index));
    hlMatches[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateHlCounter() {
    el.hlCounter.textContent = `${hlCurrent + 1} / ${hlMatches.length}`;
}

let toastTimer = null;
function showToast(msg, duration = 2400) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), duration);
}

function setupDragAndDrop() {
    window.addEventListener('dragover', event => { event.preventDefault(); event.stopPropagation(); });
    window.addEventListener('drop', event => { event.preventDefault(); event.stopPropagation(); });

    OnFileDrop(async (_x, _y, files) => {
        if (!Array.isArray(files) || files.length === 0) {
            return;
        }

        const path = files[0];
        try {
            const result = await HandleFileDrop(path);
            if (result && result.path) {
                await openPath(result.path, { pushHistory: true, setHome: true, content: result.content });
            }
        } catch (err) {
            console.error(err);
        }
    }, false);
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitLinkTarget(href) {
    const hashIndex = href.indexOf('#');
    if (hashIndex === -1) {
        return { pathPart: href, anchor: "" };
    }
    return {
        pathPart: href.slice(0, hashIndex),
        anchor: decodeURIComponent(href.slice(hashIndex + 1)),
    };
}

function scrollToAnchor(anchor) {
    if (!anchor) return;
    const target = el.markdownContainer.querySelector(`#${CSS.escape(anchor)}, a[name="${CSS.escape(anchor)}"]`);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        LogInfo(`anchor not found: ${anchor}`);
    }
}

function bindMenuEvents() {
    EventsOn('menu:open-file', () => handleOpenFile());
    EventsOn('menu:refresh', () => reloadCurrent());
    EventsOn('system:open-file', async path => openIncomingFiles([path]));
    EventsOn('menu:toggle-search', () => toggleSearch());
    EventsOn('menu:toggle-theme', () => toggleTheme());
    EventsOn('menu:font-up', () => changeFontSize(2));
    EventsOn('menu:font-down', () => changeFontSize(-2));
    EventsOn('menu:font-reset', () => {
        currentFontSize = 16;
        el.markdownContainer.style.fontSize = `${currentFontSize}px`;
        persist();
    });
}
