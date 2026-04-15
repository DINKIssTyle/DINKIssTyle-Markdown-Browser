/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import './style.css';
import 'katex/dist/katex.min.css';

// ── Module Imports ─────────────────────────────────────────
import { state, el, HOME_SCREEN_PATH, debounce, isEditableTarget, isLinux, formatSaveDialogMessage, syncEngineSelector } from './main-state.js';
import {
    createTab, getActiveTab, syncGlobalsFromTab, renderTabs,
    createAndSwitchToNewTab, closeTab, activateTabByShortcut,
} from './main-tabs.js';
import {
    handleOpenFile, openPath, openIncomingFiles, openAbout, openShortcuts, openThirdPartyNotices,
    openWhatsNew,
    goBack, goForward, goHome, reloadCurrent, updateNavButtons,
    bindHistoryMouseNavigation,
} from './main-navigation.js';
import { renderActiveTab, renderRecentFiles, applyHTMLZoom, restoreEditingPreview } from './main-render.js';
import { enterEditMode, bindEditorEvents, createNewDocument, setEditorTheme, saveCurrentDocument, hasUnsavedEditorChanges, exitEditMode, isEditorFocused, changeEditorFontSize } from './main-editor.js';
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
    AskSaveDiscardCancel,
} from '../wailsjs/go/main/App';
import { EventsOn, LogError, OnFileDrop } from '../wailsjs/runtime/runtime';

// ── App Initialization ─────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    document.documentElement.classList.toggle('platform-linux', isLinux());

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
    state.currentEditorRenderMode = s.editorRenderMode || "realtime";

    document.documentElement.classList.toggle('dark', s.theme !== "light");
    syncEngineSelector();
    if (el.edRenderMode) {
        el.edRenderMode.value = state.currentEditorRenderMode;
    }

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
        editorRenderMode: state.currentEditorRenderMode,
        aiGeneralEnabled: window.aiState?.generalAvailable ?? true,
        aiGeneralToolbarEnabled: window.aiState?.generalToolbarEnabled ?? true,
        aiGeneralProvider: window.aiState?.generalProvider || "openai",
        aiGeneralEndpoint: window.aiState?.generalEndpoint || "",
        aiGeneralModel: window.aiState?.generalModel || "qwen3.5-35b-a3b",
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
        koreanImeEnterFix: state.koreanImeFixEnabled,
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
    if (el.btnInfo) {
        el.btnInfo.onclick = () => openThirdPartyNotices(true);
    }
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
    el.editPreviewReturn.onclick = () => restoreEditingPreview();
    document.addEventListener('keydown', handleGlobalKeydown, true);
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
    if (el.footerShortcuts) {
        el.footerShortcuts.onclick = async (e) => {
            e.preventDefault();
            await openShortcuts(true);
        };
    }
    if (el.footerThirdPartyNotices) {
        el.footerThirdPartyNotices.onclick = async (e) => {
            e.preventDefault();
            await openThirdPartyNotices(true);
        };
    }
    if (el.footerCopyright) {
        el.footerCopyright.onclick = async (e) => {
            e.preventDefault();
            await openAbout(true);
        };
    }
}

// ── Drag and Drop ──────────────────────────────────────────

function blockNativeFileDrop(target) {
    if (!target?.addEventListener) {
        return;
    }

    const prevent = event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    };

    target.addEventListener('dragenter', prevent, true);
    target.addEventListener('dragover', prevent, true);
    target.addEventListener('drop', prevent, true);
}

function setupDragAndDrop() {
    blockNativeFileDrop(window);
    blockNativeFileDrop(document);
    blockNativeFileDrop(document.body);
    blockNativeFileDrop(el.mainContainer);
    blockNativeFileDrop(el.contentView);
    blockNativeFileDrop(el.markdownContainer);
    blockNativeFileDrop(el.editorView);
    blockNativeFileDrop(el.htmlFrame);

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
    const isEditorFontDownShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && (event.key === '-' || event.key === '_' || event.code === 'Minus' || event.code === 'NumpadSubtract');
    const isEditorFontUpShortcut = (event.metaKey || event.ctrlKey) && !event.altKey
        && (
            event.key === '+' ||
            event.key === '=' ||
            event.code === 'Equal' ||
            event.code === 'NumpadAdd'
        );
    
    // 편집 가능한 요소(textarea, input)에 포커스가 있을 때
    // Cmd+W(isEditingShortcut), Cmd+A, Cmd+C 등의 글로벌 단축키가 아니라면
    // 브라우저 기본 동작에 맡기고 글로벌 단축키 처리를 건너뜁니다.
    if (isEditableTarget(event.target)) {
        const isGlobalKey = (event.metaKey || event.ctrlKey)
            && (['w', 's', 'e'].includes(event.key.toLowerCase()) || /^[1-9]$/.test(event.key) || isEditorFontDownShortcut || isEditorFontUpShortcut);
        if (!isGlobalKey) {
            return;
        }
    }

    if (isEditorFocused() && (isEditorFontDownShortcut || isEditorFontUpShortcut)) {
        event.preventDefault();
        changeEditorFontSize(isEditorFontDownShortcut ? -1 : 1);
        return;
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

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        await toggleEditModeFromShortcut();
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

async function toggleEditModeFromShortcut() {
    if (!state.isEditing) {
        if (state.currentDocumentType === 'markdown') {
            enterEditMode();
        }
        return;
    }

    if (!hasUnsavedEditorChanges()) {
        await exitEditMode(false);
        return;
    }

    const activeTab = getActiveTab();
    const response = await AskSaveDiscardCancel(
        "Unsaved Changes",
        formatSaveDialogMessage(activeTab?.title, "The document has been modified. Do you want to save changes?")
    );

    if (response === "Cancel") return;

    if (response === "Save") {
        const saved = await saveCurrentDocument({ confirm: false, exitAfterSave: false });
        if (!saved) {
            return;
        }
    }

    await exitEditMode(false);
}
