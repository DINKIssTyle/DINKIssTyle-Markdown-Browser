/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import './style.css';

// ── Module Imports ─────────────────────────────────────────
import { state, el, HOME_SCREEN_PATH, debounce, isEditableTarget, syncEngineSelector } from './main-state.js';
import {
    createTab, getActiveTab, syncGlobalsFromTab, renderTabs,
    createAndSwitchToNewTab, closeTab, activateTabByShortcut,
} from './main-tabs.js';
import {
    handleOpenFile, openPath, openIncomingFiles, openThirdPartyNotices,
    openWhatsNew,
    goBack, goForward, goHome, reloadCurrent, updateNavButtons,
    bindHistoryMouseNavigation,
} from './main-navigation.js';
import { renderActiveTab, renderRecentFiles, applyHTMLZoom } from './main-render.js';
import { enterEditMode, bindEditorEvents, createNewDocument, setEditorTheme, saveCurrentDocument } from './main-editor.js';
import {
    showToast, toggleSearch, handleSearch, handleSearchInputKeydown,
    updateSearchClearButton, clearSearchInput, cancelCurrentTask, closeContextMenu,
    copyTextToClipboard, bindHighlightNav, bindContextMenu,
} from './main-ui.js';
import { initAI, bindAIEvents } from './main-ai.js';

import {
    FrontendReady,
    GetSettings,
    SaveSettings,
    ClearRecentFiles,
    HandleFileDrop,
    GetVersion,
} from '../wailsjs/go/main/App';
import { EventsOn, LogError, OnFileDrop } from '../wailsjs/runtime/runtime';

// ── App Initialization ─────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    // Step 1: Parallelize initial data fetching from Go backend
    await Promise.all([loadSettings(), renderRecentFiles()]);

    bindToolbar();
    bindHomeScreen();
    bindHighlightNav();
    bindContextMenu();
    setupDragAndDrop();
    bindMenuEvents();
    
    // AI Init
    window.aiState = await initAI();
    bindAIEvents();

    // Step 2: Check for pending startup files BEFORE rendering the first tab
    const startupPaths = await FrontendReady();
    const hasStartupFiles = (startupPaths && startupPaths.length > 0);
    const initialPath = hasStartupFiles ? startupPaths[0] : HOME_SCREEN_PATH;
    
    const initialTab = createTab({ 
        path: initialPath, 
        title: hasStartupFiles ? 'Loading...' : 'Start' 
    });
    state.tabs = [initialTab];
    state.activeTabId = initialTab.id;
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

// ── Settings ───────────────────────────────────────────────

async function loadSettings() {
    const s = await GetSettings();
    state.currentFontSize = s.fontSize || 16;
    state.currentMarkdownEngine = s.engine || "marked";
    state.currentEngine = state.currentMarkdownEngine;

    document.documentElement.classList.toggle('dark', s.theme !== "light");
    syncEngineSelector();

    // Update footer version
    try {
        const currentVersion = await GetVersion();
        if (el.appVersionFooter) {
            el.appVersionFooter.textContent = `Version ${currentVersion}`;
        }
    } catch (err) {
        console.error("Failed to get version:", err);
    }
}

async function persist() {
    await SaveSettings({
        theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
        fontSize: state.currentFontSize,
        engine: state.currentMarkdownEngine,
        aiGeneralEnabled: window.aiState?.generalEnabled ?? true,
        aiGeneralProvider: window.aiState?.generalProvider || "openai",
        aiGeneralEndpoint: window.aiState?.generalEndpoint || "",
        aiGeneralModel: window.aiState?.generalModel || "qwen3.5-35b-a3b",
        aiGeneralKey: window.aiState?.generalKey || "",
        aiGeneralTemp: window.aiState?.generalTemp || 0,
        aiFimEnabled: window.aiState?.fimAvailable ?? true,
        aiFimEndpoint: window.aiState?.fimEndpoint || "",
        aiFimModel: window.aiState?.fimModel || "qwen2.5-coder-0.5b-instruct-mlx",
        aiFimKey: window.aiState?.fimKey || "",
        aiFimTemp: window.aiState?.fimTemp || 0,
    });
}

function changeFontSize(delta) {
    state.currentFontSize = Math.min(72, Math.max(10, state.currentFontSize + delta));
    el.markdownContainer.style.fontSize = `${state.currentFontSize}px`;
    applyHTMLZoom();
    persist();
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    setEditorTheme(isDark);
    persist();
}

// ── Toolbar Binding ────────────────────────────────────────

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
    el.btnNewDoc.onclick = createNewDocument;
    el.btnEdit.onclick = enterEditMode;
    el.selectEngine.onchange = async event => {
        if (event.target.value === 'html') {
            syncEngineSelector();
            return;
        }

        state.currentMarkdownEngine = event.target.value;
        state.currentEngine = state.currentMarkdownEngine;
        await persist();
        if (state.currentDocumentType !== 'html') {
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

// ── Home Screen Binding ────────────────────────────────────

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

    if (el.footerWhatsNew) {
        el.footerWhatsNew.onclick = async (e) => {
            e.preventDefault();
            await openWhatsNew(true);
        };
    }
}

// ── Drag and Drop ──────────────────────────────────────────

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

// ── Menu Events ────────────────────────────────────────────

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
        state.currentFontSize = 16;
        el.markdownContainer.style.fontSize = `${state.currentFontSize}px`;
        persist();
    });

    EventsOn('app:show-whats-new', async (version) => {
        console.log(`New version detected: ${version}. Opening What's New...`);
        // Wait a bit to ensure the initial tab is rendered
        setTimeout(async () => {
            await openWhatsNew(true);
        }, 500);
    });
}

// ── Global Keyboard Shortcuts ──────────────────────────────

async function handleGlobalKeydown(event) {
    const isEditingShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w';
    
    // 편집 가능한 요소(textarea, input)에 포커스가 있을 때
    // Cmd+W(isEditingShortcut), Cmd+A, Cmd+C 등의 글로벌 단축키가 아니라면
    // 브라우저 기본 동작에 맡기고 글로벌 단축키 처리를 건너뜁니다.
    if (isEditableTarget(event.target)) {
        const isGlobalKey = (event.metaKey || event.ctrlKey) && ['w', 's'].includes(event.key.toLowerCase());
        if (!isGlobalKey) {
            return;
        }
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
        if (!state.isEditing) {
            return;
        }
        event.preventDefault();
        await saveCurrentDocument({ confirm: false, exitAfterSave: false });
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
