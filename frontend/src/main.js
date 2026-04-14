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
    SaveFile,
    AskConfirm,
    AskSaveDiscardCancel,
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
let currentMarkdownEngine = "marked";
let currentDocumentType = "markdown";
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
let htmlFrameResizeObserver = null;
let activeProgressTaskId = 0;
let draggedTabId = "";
let lastHistoryMouseTrigger = { button: -1, timeStamp: -1 };
let isEditing = false;
let editorOriginalContent = "";

const getScroller = () => document.getElementById('content-view');
const $ = id => document.getElementById(id);

const el = {
    currentPath: $('current-path'),
    tabsList: $('tabs-list'),
    btnNewTab: $('btn-new-tab'),
    homeScreen: $('home-screen'),
    recentList: $('recent-files-list'),
    markdownContainer: $('markdown-container'),
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
    edCancel: $('ed-cancel'),
    edSave: $('ed-save'),
};

window.addEventListener('DOMContentLoaded', async () => {
    // Step 1: Parallelize initial data fetching from Go backend
    await Promise.all([loadSettings(), renderRecentFiles()]);

    bindToolbar();
    bindHomeScreen();
    bindHighlightNav();
    bindContextMenu();
    setupDragAndDrop();
    bindMenuEvents();

    // Step 2: Check for pending startup files BEFORE rendering the first tab
    const startupPaths = await FrontendReady();
    const hasStartupFiles = (startupPaths && startupPaths.length > 0);
    const initialPath = hasStartupFiles ? startupPaths[0] : HOME_SCREEN_PATH;
    
    const initialTab = createTab({ 
        path: initialPath, 
        title: hasStartupFiles ? 'Loading...' : 'Start' 
    });
    tabs = [initialTab];
    activeTabId = initialTab.id;
    syncGlobalsFromTab(initialTab);
    renderTabs();

    if (hasStartupFiles) {
        // Step 3: Directly open the first startup file (skip redundant Home Screen render)
        await openPath(startupPaths[0], { pushHistory: true, setHome: true });
        if (startupPaths.length > 1) {
            await openIncomingFiles(startupPaths.slice(1));
        }
    } else {
        // No startup files, proceed to Home Screen
        await renderActiveTab();
    }
    
    updateNavButtons();
    
    document.addEventListener('copy', () => {
        showToast('Copied to clipboard.');
    });
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

function documentTypeFromPath(path) {
    if (path === HOME_SCREEN_PATH) return 'home';
    if (path === THIRD_PARTY_NOTICES_PATH) return 'markdown';
    return /\.html?$/i.test(path) ? 'html' : 'markdown';
}

function createTab({ path = HOME_SCREEN_PATH, title = 'New Tab' } = {}) {
    return {
        id: `tab-${nextTabID++}`,
        path,
        kind: kindFromPath(path),
        documentType: documentTypeFromPath(path),
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
    tab.documentType = currentDocumentType;
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
    currentDocumentType = tab.documentType || documentTypeFromPath(tab.path);
    currentFolder = tab.currentFolder || getPathDirname(tab.path);
    currentMarkdownSource = tab.currentMarkdownSource || "";
    navHistory = (tab.navHistory || [{ path: tab.path, scroll: 0 }]).map(item => ({ ...item }));
    navIndex = typeof tab.navIndex === "number" ? tab.navIndex : navHistory.length - 1;
    homeTargetPath = tab.homeTargetPath || HOME_SCREEN_PATH;
    pendingKeyword = tab.pendingKeyword || "";
    pendingAnchor = tab.pendingAnchor || "";
    syncEngineSelector();
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
        <div class="tab-item ${tab.id === activeTabId ? 'active' : ''}" data-tab-id="${tab.id}" draggable="true">
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

        tabNode.addEventListener('dragstart', event => {
            if (event.target.closest('[data-close-tab]')) {
                event.preventDefault();
                return;
            }

            draggedTabId = tabNode.dataset.tabId;
            tabNode.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draggedTabId);
        });

        tabNode.addEventListener('dragover', event => {
            if (!draggedTabId || draggedTabId === tabNode.dataset.tabId) {
                return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        });

        tabNode.addEventListener('drop', event => {
            event.preventDefault();
            moveTab(draggedTabId, tabNode.dataset.tabId);
        });

        tabNode.addEventListener('dragend', () => {
            draggedTabId = "";
            el.tabsList.querySelectorAll('.tab-item.dragging').forEach(node => node.classList.remove('dragging'));
        });
    });

    el.tabsList.querySelectorAll('[data-close-tab]').forEach(button => {
        button.addEventListener('click', async event => {
            event.stopPropagation();
            await closeTab(button.dataset.closeTab);
        });
    });

    el.tabsList.querySelector('.tab-item.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function moveTab(sourceTabID, targetTabID) {
    if (!sourceTabID || !targetTabID || sourceTabID === targetTabID) {
        return;
    }

    const sourceIndex = tabs.findIndex(tab => tab.id === sourceTabID);
    const targetIndex = tabs.findIndex(tab => tab.id === targetTabID);
    if (sourceIndex === -1 || targetIndex === -1) {
        return;
    }

    const [movedTab] = tabs.splice(sourceIndex, 1);
    tabs.splice(targetIndex, 0, movedTab);
    renderTabs();
}

async function closeTab(tabID) {
    // Check for unsaved changes if editing this tab
    if (isEditing && tabID === activeTabId) {
        if (el.markdownEditor.value !== editorOriginalContent) {
            const response = await AskSaveDiscardCancel("Unsaved Changes", "The document has been modified. Do you want to save changes?");
            
            if (response === "Cancel") return;
            
            if (response === "Save") {
                try {
                    await SaveFile(currentFilePath, el.markdownEditor.value);
                    showToast("File saved successfully. ✅");
                } catch (error) {
                    LogError(`Auto-save on close failed: ${error}`);
                    showToast("Failed to save file. ❌");
                    return; // Don't close tab if save failed
                }
            }
            // If "Discard", just continue
        }
        await exitEditMode(false);
    }

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
    currentMarkdownEngine = s.engine || "marked";
    currentEngine = currentMarkdownEngine;

    document.documentElement.classList.toggle('dark', s.theme !== "light");
    syncEngineSelector();
}

async function persist() {
    await SaveSettings({
        theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
        fontSize: currentFontSize,
        engine: currentMarkdownEngine,
    });
}

function syncEngineSelector() {
    if (currentDocumentType === 'html') {
        currentEngine = 'html';
        el.selectEngine.value = 'html';
        el.selectEngine.disabled = true;
        return;
    }

    currentEngine = currentMarkdownEngine;
    el.selectEngine.value = currentMarkdownEngine;
    el.selectEngine.disabled = false;
}

async function renderRecentFiles() {
    recentFilesCache = await GetRecentFiles();
    if (!recentFilesCache || recentFilesCache.length === 0) {
        el.recentList.classList.add('empty');
        el.recentList.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined empty-state-icon" aria-hidden="true">history</span>
                <div class="empty-state-title">No recent documents yet</div>
                <div class="empty-state-copy">Open a Markdown or HTML file and it will appear here for quick access.</div>
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
    el.btnEdit.onclick = enterEditMode;
    el.selectEngine.onchange = async event => {
        if (event.target.value === 'html') {
            syncEngineSelector();
            return;
        }

        currentMarkdownEngine = event.target.value;
        currentEngine = currentMarkdownEngine;
        await persist();
        if (currentDocumentType !== 'html') {
            await renderActiveTab();
        }
    };
    el.searchInput.addEventListener('input', debounce(handleSearch, 300));
    el.searchInput.addEventListener('input', updateSearchClearButton);
    el.searchInput.addEventListener('keydown', handleSearchInputKeydown);
    el.btnClearSearch.onclick = clearSearchInput;
    el.searchOpenTabFolders.addEventListener('change', () => handleSearch());
    el.btnProgressCancel.onclick = cancelCurrentTask;
    document.addEventListener('keydown', handleGlobalKeydown);
    bindHistoryMouseNavigation(document);
    bindEditorEvents();
}
 
function bindEditorEvents() {
    el.edBold.onclick = () => insertTextAtCursor('**', '**');
    el.edItalic.onclick = () => insertTextAtCursor('*', '*');
    el.edStrike.onclick = () => insertTextAtCursor('~~', '~~');
    el.edQuote.onclick = () => insertTextAtCursor('\n> ', '');
    el.edH1.onclick = () => insertTextAtCursor('\n# ', '');
    el.edH2.onclick = () => insertTextAtCursor('\n## ', '');
    el.edH3.onclick = () => insertTextAtCursor('\n### ', '');
    el.edUl.onclick = () => insertTextAtCursor('\n- ', '');
    el.edOl.onclick = () => insertTextAtCursor('\n1. ', '');
    el.edHr.onclick = () => insertTextAtCursor('\n---\n', '');
    
    el.edLink.onclick = () => {
        const url = window.prompt("Enter link URL:", "https://");
        if (url) insertTextAtCursor('[', `](${url})`);
    };
    
    el.edImage.onclick = () => {
        const url = window.prompt("Enter image URL or path:", "https://");
        if (url) insertTextAtCursor('![', `](${url})`);
    };
    
    el.edCode.onclick = () => {
        const lang = window.prompt("Enter language (optional):", "javascript");
        insertTextAtCursor(`\n\`\`\`${lang || ''}\n`, '\n\`\`\`\n');
    };
    
    el.edTable.onclick = () => {
        const rows = parseInt(window.prompt("Number of rows:", "3") || "0");
        const cols = parseInt(window.prompt("Number of columns:", "3") || "0");
        if (rows > 0 && cols > 0) {
            let table = '\n|';
            for (let c = 0; c < cols; c++) table += ` Header ${c+1} |`;
            table += '\n|';
            for (let c = 0; c < cols; c++) table += ' --- |';
            for (let r = 0; r < rows; r++) {
                table += '\n|';
                for (let c = 0; c < cols; c++) table += ` Cell |`;
            }
            table += '\n';
            insertTextAtCursor(table, '');
        }
    };
    
    el.edTask.onclick = () => insertTextAtCursor('\n- [ ] ', '');
    el.edLatex.onclick = () => {
        const block = window.confirm("Use block math ($$)?\n(Cancel for inline math $)");
        const tag = block ? '$$' : '$';
        insertTextAtCursor(tag, tag);
    };
    
    el.edEmoji.onclick = () => {
        const emojis = ['😀', '🚀', '🔥', '✅', '❌', '📝', '📂', '💡', '⚠️', '⭐'];
        const choice = window.prompt(`Common emojis:\n${emojis.join(' ')}\nOr enter any emoji:`, '😀');
        if (choice) insertTextAtCursor(choice, '');
    };
    
    el.edCancel.onclick = handleCancel;
    el.edSave.onclick = handleSave;
    
    el.markdownEditor.oninput = (e) => {
        const tab = getActiveTab();
        if (tab) tab.currentMarkdownSource = el.markdownEditor.value;
        
        // Update preview if it's a newline or always (user asked for newline specifically)
        if (e.inputType === 'insertLineBreak' || el.markdownEditor.value.endsWith('\n')) {
            renderMarkdown(el.markdownEditor.value);
        }
    };
    
    // Support Tab key in textarea
    el.markdownEditor.onkeydown = (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            insertTextAtCursor('    ', '');
        }
    };
}

function enterEditMode() {
    if (isEditing || currentDocumentType !== 'markdown') return;
    
    isEditing = true;
    editorOriginalContent = currentMarkdownSource;
    el.markdownEditor.value = currentMarkdownSource;
    
    el.editToolbar.classList.remove('hidden');
    el.editorView.classList.remove('hidden');
    el.mainContainer.classList.add('is-editing');
    el.btnEdit.classList.add('active');
    
    // Ensure content view is visible for preview
    el.contentView.classList.remove('hidden'); 
    
    // Hide other non-editor UI
    el.btnSearchToggle.disabled = true;
    el.selectEngine.disabled = true;
    
    el.markdownEditor.focus();
}

async function exitEditMode(didSave = false) {
    if (!isEditing) return;
    
    isEditing = false;
    el.editToolbar.classList.add('hidden');
    el.editorView.classList.add('hidden');
    el.mainContainer.classList.remove('is-editing');
    el.btnEdit.classList.remove('active');
    
    el.btnSearchToggle.disabled = false;
    el.selectEngine.disabled = false;
    
    if (didSave) {
        await reloadCurrent();
    } else {
        currentMarkdownSource = editorOriginalContent;
        const tab = getActiveTab();
        if (tab) tab.currentMarkdownSource = editorOriginalContent;
        await renderActiveTab();
    }
}

async function handleSave() {
    const ok = await AskConfirm("Save Changes", "Do you want to save changes to the file?", "Save", "Cancel");
    if (!ok) return;
    
    try {
        await SaveFile(currentFilePath, el.markdownEditor.value);
        showToast("File saved successfully. ✅");
        await exitEditMode(true);
    } catch (error) {
        LogError(`Save failed: ${error}`);
        showToast("Failed to save file. ❌");
    }
}

async function handleCancel() {
    if (el.markdownEditor.value !== editorOriginalContent) {
        const ok = await AskConfirm("Unsaved Changes", "You have unsaved changes. Discard them?", "Discard", "Cancel");
        if (!ok) return;
    }
    exitEditMode(false);
}

function insertTextAtCursor(prefix, suffix) {
    const textarea = el.markdownEditor;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    textarea.value = before + prefix + selection + suffix + after;
    textarea.selectionStart = start + prefix.length;
    textarea.selectionEnd = start + prefix.length + selection.length;
    textarea.focus();
    
    // Force inpur event to update tab state
    textarea.dispatchEvent(new Event('input'));
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
        showToast('Copied selection. 📋');
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

async function handleGlobalKeydown(event) {
    const isEditingShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w';
    
    if (isEditableTarget(event.target) && !isEditingShortcut) {
        return;
    }

    // Cmd+C 단축키 지원 (유니코드 무결성 유지를 위해 trim() 없이 처리)
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c') {
        const selectionText = window.getSelection()?.toString() || "";
        if (selectionText) {
            event.preventDefault();
            copyTextToClipboard(selectionText)
                .then(() => showToast('Copied selection. 📋'))
                .catch(error => LogError(`keyboard copy failed: ${error?.message || error}`));
        }
        return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        const active = getActiveTab();
        if (active) {
            await closeTab(active.id);
        }
        return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        reloadCurrent().catch(error => LogError(`keyboard refresh failed: ${error?.message || error}`));
        return;
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        goHome();
        return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        activateTabByShortcut(Number(event.key));
        return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key === '[') {
        event.preventDefault();
        goBack();
        return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key === ']') {
        event.preventDefault();
        goForward();
        return;
    }

    if (event.key === 'Escape') {
        closeContextMenu();
    }
}

function bindHistoryMouseNavigation(target) {
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

function handleContextMenu(event) {
    const selectionText = window.getSelection()?.toString() || "";
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
    el.progressTitle.classList.toggle('shimmering', /rendering document/i.test(title));
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
    el.progressTitle.classList.remove('shimmering');
    progressHideTimer = setTimeout(() => {
        el.progressWidget.classList.remove('show');
        setTimeout(() => el.progressWidget.classList.add('hidden'), 250);
    }, 400);
}

function updateProgress(title, progress = null) {
    showProgress(title, progress);
}

function beginProgressTask(title, progress = null) {
    activeProgressTaskId += 1;
    const taskId = activeProgressTaskId;
    showProgress(title, progress);
    return taskId;
}

function isProgressTaskActive(taskId) {
    return taskId !== 0 && taskId === activeProgressTaskId;
}

function createCancelledTaskError() {
    const error = new Error('Task cancelled');
    error.name = 'TaskCancelledError';
    return error;
}

function throwIfTaskCancelled(taskId) {
    if (!isProgressTaskActive(taskId)) {
        throw createCancelledTaskError();
    }
}

function finishProgressTask(taskId) {
    if (!isProgressTaskActive(taskId)) {
        return;
    }

    updateProgress('Done', 100);
    hideProgress();
}

function cancelProgressTask(taskId) {
    if (!isProgressTaskActive(taskId)) {
        return false;
    }

    activeProgressTaskId += 1;
    cleanupHTMLFrame({ resetSource: true });
    hideProgress();
    return true;
}

function isCancelledTaskError(error) {
    return error?.name === 'TaskCancelledError';
}

async function yieldToUI() {
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function cancelCurrentTask() {
    if (cancelProgressTask(activeProgressTaskId)) {
        showToast('Loading cancelled.');
    }
}

async function handleOpenFile() {
    const result = await OpenFile();
    if (result && result.path) {
        await openPath(result.path, { pushHistory: true, setHome: true, content: result.content });
    }
}

async function consumeStartupOpenFiles() {
    // This function is now handled directly in DOMContentLoaded for better performance.
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

function normalizeFileURLPath(path) {
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
    path = normalizeFileURLPath(path);

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
    const taskId = shouldShowProgress ? beginProgressTask('Loading document', 18) : 0;

    try {
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
            throwIfTaskCancelled(taskId);
            updateProgress('Rendering document', 82);
            await yieldToUI();
            throwIfTaskCancelled(taskId);
            await loadFile(path, bundled, pushHistory, false);
            return;
        }

        updateProgress('Reading markdown file', 42);
        const fileContent = content ?? await ReadFile(path);
        throwIfTaskCancelled(taskId);
        updateProgress('Rendering document', 82);
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
    currentDocumentType = documentTypeFromPath(path);
    currentFolder = getPathDirname(path);
    currentMarkdownSource = content;
    syncEngineSelector();

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

    const taskId = beginProgressTask('Refreshing document', 24);

    try {
        if (currentFilePath === THIRD_PARTY_NOTICES_PATH) {
            updateProgress('Loading bundled document', 48);
            currentMarkdownSource = await loadBundledMarkdown(currentFilePath);
            throwIfTaskCancelled(taskId);
            syncTabFromGlobals(tab);
            updateProgress('Rendering document', 82);
            await yieldToUI();
            throwIfTaskCancelled(taskId);
            await renderActiveTab();
            return;
        }

        updateProgress('Reading markdown file', 48);
        currentMarkdownSource = await ReadFile(currentFilePath);
        throwIfTaskCancelled(taskId);
        syncTabFromGlobals(tab);
        updateProgress('Rendering document', 82);
        await yieldToUI();
        throwIfTaskCancelled(taskId);
        await renderActiveTab();
    } catch (error) {
        if (isCancelledTaskError(error)) {
            return;
        }
        LogError(`reloadCurrent failed path=${currentFilePath}: ${error?.message || error}`);
        showToast(error?.message || 'Failed to refresh file.');
    } finally {
        finishProgressTask(taskId);
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

    syncEngineSelector();
    el.currentPath.innerText = formatDisplayPath(currentFilePath);
    updateNavButtons();

    // Update edit button state
    const isMarkdown = currentDocumentType === 'markdown' && 
                       currentFilePath !== HOME_SCREEN_PATH && 
                       currentFilePath !== THIRD_PARTY_NOTICES_PATH;
    el.btnEdit.disabled = !isMarkdown;

    if (isEditing && !isMarkdown) {
        await exitEditMode(false);
    }

    if (currentFilePath === HOME_SCREEN_PATH) {
        await renderHomeScreen();
        return;
    }

    el.homeScreen.classList.add('hidden');
    getScroller().classList.toggle('html-mode', currentDocumentType === 'html');
    if (currentDocumentType === 'html') {
        await renderHTMLDocument(currentFilePath);
    } else {
        el.htmlFrame.classList.add('hidden');
        el.markdownContainer.classList.remove('hidden');
        await renderMarkdown(currentMarkdownSource);
    }

    const saved = navHistory[navIndex]?.scroll ?? 0;
    getScroller().scrollTop = saved;

    if (pendingAnchor) {
        scrollToAnchor(pendingAnchor);
        pendingAnchor = "";
        tab.pendingAnchor = "";
    }

    if (currentDocumentType === 'html') {
        clearHighlight();
        return;
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
    if (isEditing) await exitEditMode(false);
    await renderRecentFiles();
    cleanupHTMLFrame();
    clearHighlight();
    getScroller().classList.remove('html-mode');
    el.markdownContainer.classList.add('hidden');
    el.htmlFrame.classList.add('hidden');
    el.homeScreen.classList.remove('hidden');
    getScroller().scrollTop = navHistory[navIndex]?.scroll ?? 0;
}

function deriveTabTitle(path, content) {
    if (path === HOME_SCREEN_PATH) return 'Start';
    if (path === THIRD_PARTY_NOTICES_PATH) return 'Open Source Notices';
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

function cleanupHTMLFrame(options = {}) {
    const { resetSource = false } = options;
    if (htmlFrameResizeObserver) {
        htmlFrameResizeObserver.disconnect();
        htmlFrameResizeObserver = null;
    }
    el.htmlFrame.onload = null;
    if (resetSource) {
        el.htmlFrame.src = 'about:blank';
    }
}

function getLocalFileURL(path) {
    const normalized = path.replace(/\\/g, '/');
    const encodedPath = normalized
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
    return `/localfile/${encodedPath}?t=${Date.now()}`;
}

function resizeHTMLFrame() {
    try {
        const doc = el.htmlFrame.contentDocument;
        if (!doc) return;
        const bodyHeight = doc.body ? doc.body.scrollHeight : 0;
        const rootHeight = doc.documentElement ? doc.documentElement.scrollHeight : 0;
        el.htmlFrame.style.height = `${Math.max(bodyHeight, rootHeight, 720)}px`;
    } catch (error) {
        LogError(`html frame resize failed: ${error?.message || error}`);
    }
}

function applyHTMLZoom() {
    try {
        const doc = el.htmlFrame.contentDocument;
        if (!doc || currentDocumentType !== 'html') {
            return;
        }

        const zoom = Math.max(0.625, currentFontSize / 16);
        doc.documentElement.style.zoom = String(zoom);
        if (doc.body) {
            doc.body.style.zoom = String(zoom);
        }
        resizeHTMLFrame();
    } catch (error) {
        LogError(`html zoom failed: ${error?.message || error}`);
    }
}

function wireHTMLDocumentLinks(doc) {
    bindHistoryMouseNavigation(doc);

    doc.querySelectorAll('a[href]').forEach(anchor => {
        const rawHref = anchor.getAttribute('href');
        if (!rawHref) return;

        anchor.addEventListener('click', event => {
            const href = anchor.href || rawHref;

            if (rawHref.startsWith('#')) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (isExternalURL(href)) {
                void confirmAndOpenExternalLink(href);
                return;
            }

            const wantsNewTab = event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
            resolveLink(href, { newTab: wantsNewTab });
        });

        anchor.addEventListener('auxclick', event => {
            const href = anchor.href || rawHref;
            if (event.button === 1) {
                event.preventDefault();
                event.stopPropagation();

                if (isExternalURL(href)) {
                    void confirmAndOpenExternalLink(href);
                    return;
                }

                resolveLink(href, { newTab: true });
            }
        });
    });
}

async function renderHTMLDocument(path) {
    cleanupHTMLFrame();
    clearHighlight();
    el.markdownContainer.classList.add('hidden');
    el.htmlFrame.classList.remove('hidden');

    await new Promise((resolve, reject) => {
        let settled = false;

        const settle = callback => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(loadTimeout);
            window.clearInterval(readyStatePoll);
            callback();
        };

        const tryResolveFromDocument = () => {
            try {
                const doc = el.htmlFrame.contentDocument;
                if (!doc) {
                    return false;
                }

                const href = el.htmlFrame.contentWindow?.location?.href || "";
                const hasNavigated = href && href !== 'about:blank';
                const hasRenderableRoot = !!(doc.documentElement && (doc.body || doc.documentElement.children.length > 0));
                if (!hasNavigated || !hasRenderableRoot) {
                    return false;
                }

                wireHTMLDocumentLinks(doc);
                applyHTMLZoom();
                resizeHTMLFrame();

                htmlFrameResizeObserver = new ResizeObserver(() => resizeHTMLFrame());
                if (doc.body) htmlFrameResizeObserver.observe(doc.body);
                if (doc.documentElement) htmlFrameResizeObserver.observe(doc.documentElement);
                return true;
            } catch (error) {
                settle(() => reject(error));
                return false;
            }
        };

        const loadTimeout = window.setTimeout(() => {
            if (tryResolveFromDocument()) {
                settle(resolve);
                return;
            }
            const doc = el.htmlFrame.contentDocument;
            if (doc?.documentElement) {
                LogInfo(`html frame timeout fallback path=${path}`);
                settle(resolve);
                return;
            }
            cleanupHTMLFrame({ resetSource: true });
            settle(() => reject(new Error('Timed out while loading the HTML document.')));
        }, 12000);

        const readyStatePoll = window.setInterval(() => {
            if (tryResolveFromDocument()) {
                settle(resolve);
            }
        }, 120);

        el.htmlFrame.onload = () => {
            if (tryResolveFromDocument()) {
                settle(resolve);
            }
        };

        el.htmlFrame.src = getLocalFileURL(path);
    });
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

function resolveLink(rel, options = {}) {
    const { pathPart, anchor } = splitLinkTarget(rel);

    if (!pathPart && anchor) {
        pendingAnchor = anchor;
        scrollToAnchor(anchor);
        return;
    }

    const normalizedPathPart = normalizeAppLocalFileHref(pathPart) || pathPart;
    const fileURLPath = normalizeFileURLPath(normalizedPathPart);
    const resolvedPath = fileURLPath.startsWith('/') ? fileURLPath : joinPath(currentFolder, fileURLPath);
    LogInfo(`markdown link href=${rel} resolved=${resolvedPath} anchor=${anchor || ""} newTab=${!!options.newTab}`);
    openPath(resolvedPath, { ...options, anchor });
}

function isExternalURL(href) {
    return /^(https?:|mailto:)/i.test(href);
}

function normalizeAppLocalFileHref(href) {
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
    applyHTMLZoom();
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

    // 검색창 내부 Cmd+C/X 단축키 지원 복원
    if (key === 'c' && hasSelection) {
        event.preventDefault();
        copyTextToClipboard(el.searchInput.value.slice(el.searchInput.selectionStart, el.searchInput.selectionEnd))
            .then(() => showToast('Copied selection. 📋'));
        return;
    }

    if (key === 'x' && hasSelection) {
        event.preventDefault();
        copyTextToClipboard(el.searchInput.value.slice(el.searchInput.selectionStart, el.searchInput.selectionEnd))
            .then(() => showToast('Cut selection. ✂️'));
        el.searchInput.setRangeText("", el.searchInput.selectionStart, el.searchInput.selectionEnd, 'start');
        updateSearchClearButton();
        handleSearch();
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
    const scope = currentDocumentType === 'html'
        ? el.htmlFrame.contentDocument
        : el.markdownContainer;
    const target = scope?.querySelector?.(`#${CSS.escape(anchor)}, a[name="${CSS.escape(anchor)}"]`);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        LogInfo(`anchor not found: ${anchor}`);
    }
}

function bindMenuEvents() {
    EventsOn('menu:new-window', () => createAndSwitchToNewTab());
    EventsOn('menu:home', () => goHome());
    EventsOn('menu:back', () => goBack());
    EventsOn('menu:forward', () => goForward());
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
