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
    goBack, goForward, goHome, reloadCurrent, updateNavButtons,
    bindHistoryMouseNavigation,
} from './main-navigation.js';
import { renderActiveTab, renderRecentFiles, applyHTMLZoom } from './main-render.js';
import { enterEditMode, bindEditorEvents } from './main-editor.js';
import {
    showToast, toggleSearch, handleSearch, handleSearchInputKeydown,
    updateSearchClearButton, clearSearchInput, cancelCurrentTask, closeContextMenu,
    copyTextToClipboard, bindHighlightNav, bindContextMenu,
} from './main-ui.js';

import {
    FrontendReady,
    GetSettings,
    SaveSettings,
    ClearRecentFiles,
    HandleFileDrop,
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
}

async function persist() {
    await SaveSettings({
        theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
        fontSize: state.currentFontSize,
        engine: state.currentMarkdownEngine,
    });
}

function changeFontSize(delta) {
    state.currentFontSize = Math.min(72, Math.max(10, state.currentFontSize + delta));
    el.markdownContainer.style.fontSize = `${state.currentFontSize}px`;
    applyHTMLZoom();
    persist();
}

function toggleTheme() {
    document.documentElement.classList.toggle('dark');
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
}

// ── Global Keyboard Shortcuts ──────────────────────────────

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
