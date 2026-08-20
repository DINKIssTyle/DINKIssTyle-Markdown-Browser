/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import './style.css';
import 'katex/dist/katex.min.css';
import { DEFAULT_CONTENT_FONT_SIZE, MIN_SPLASH_MS } from './config.js';

// ── Module Imports ─────────────────────────────────────────
import { state, el, HOME_SCREEN_PATH, debounce, isEditableTarget, isLinux, formatSaveDialogMessage, syncEngineSelector, normalizeFileURLPath } from './main-state.js';
import {
    createTab, getActiveTab, syncGlobalsFromTab, renderTabs,
    createAndSwitchToNewTab, closeTab, reopenClosedTab, activateTabByShortcut, switchToTab,
} from './main-tabs.js';
import {
    handleOpenFile, openPath, openIncomingFiles, openAbout, openFeatures, openShortcuts, openThirdPartyNotices,
    openWhatsNew, shouldOpenAdditionalFileInNewTab,
    goBack, goForward, goHome, reloadCurrent, updateNavButtons,
    bindHistoryMouseNavigation, bindNativeHistoryNavigation,
} from './main-navigation.js';
import { bindDocumentMetadataUI, renderActiveTab, renderRecentFiles, applyHTMLZoom, restoreEditingPreview, openEditingPreviewInNewTab } from './main-render.js';
import { enterEditMode, bindEditorEvents, createNewDocument, setEditorTheme, saveCurrentDocument, saveCurrentDocumentAs, hasUnsavedEditorChanges, exitEditMode, isEditorFocused, changeEditorFontSize, resetEditorFontSize, applyEditorPreferencesFromSettings, translateViewerDocument, toggleEditorPreview, scrollEditorToLine } from './main-editor.js';
import {
    showToast, toggleSearch, handleSearch, handleSearchInputKeydown, applyHighlight,
    updateSearchClearButton, clearSearchInput, cancelCurrentTask, closeContextMenu,
    copyTextToClipboard, bindHighlightNav, bindContextMenu,
} from './main-ui.js';
import { initAI, bindAIEvents, openSettings, showAskAIPrompt } from './main-ai.js';
import { bindUpdateEvents, runAutomaticUpdateCheck } from './main-update.js';
import { initSidebar, toggleSidebar, toggleSidebarTab } from './main-sidebar.js';
import {
    applyAccentColors, applyDocumentMarginStyle, applyViewerFontFamily, resolveAccentSettings,
    applyThemeMode, normalizeThemeMode, resolveEffectiveTheme,
} from './main-theme.js';
import {
    loadScrollbarVisibility, loadMainToolbarVisibility, loadThemeMode,
    syncThemeSettingsControls, syncScrollbarSettingsControls, syncMainToolbarSettingsControls,
    persistAppSettings,
} from './main-settings.js';
import { initializePlatform, isMobilePlatform, printForCurrentPlatform } from './platform-common.js';

import {
    FrontendReady,
    GetSettings,
    ClearRecentFiles,
    ToggleRecentFilePinned,
    HandleFileDrop,
    GetVersion,
    InstallSystemIntegration,
    UninstallSystemIntegration,
    AskSaveDiscardCancel,
    PrintCurrentWindow,
    ShowPageSetup,
} from '../bindings/dinkisstyle-markdown-browser/internal/app/app';
import { EventsOn, LogError, OnFileDrop } from './wails-runtime';

// ── App Initialization ─────────────────────────────────────

const platformReady = initializePlatform();

window.addEventListener('DOMContentLoaded', async () => {
    await platformReady;
    const splashStartedAt = performance.now();
    const runningOnLinux = isLinux();
    document.documentElement.classList.toggle('platform-linux', runningOnLinux);
    updateLinuxInstallLink(runningOnLinux);

    try {
        await loadSettings();
        await renderRecentFiles();

        bindToolbar();
        bindDocumentMetadataUI();
        bindHomeScreen();
        bindSystemInstallModal();
        bindHighlightNav();
        bindContextMenu();
        setupDragAndDrop();
        bindMenuEvents();
        initSidebar();

        // AI Init
        window.aiState = await initAI();
        bindAIEvents();
        if (!isMobilePlatform()) {
            bindUpdateEvents({ openSettings });
        }

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
        if (!isMobilePlatform()) {
            void runAutomaticUpdateCheck();
        }

        document.addEventListener('copy', () => {
            showToast('Copied to clipboard.');
        });
    } finally {
        await hideStartupSplash(splashStartedAt);
    }
});

async function hideStartupSplash(startedAt) {
    const splash = el.startupSplash;
    if (!splash) {
        return;
    }

    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

    if (remaining > 0) {
        await new Promise(resolve => window.setTimeout(resolve, remaining));
    }

    splash.classList.add('is-hiding');
    removeAfterOpacityTransition(splash);
}

function removeAfterOpacityTransition(element) {
    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        element.remove();
    };
    const handleTransitionEnd = event => {
        if (event.target === element && event.propertyName === 'opacity') {
            remove();
        }
    };

    element.addEventListener('transitionend', handleTransitionEnd);
    element.addEventListener('transitioncancel', remove, { once: true });

    const styles = window.getComputedStyle(element);
    const durations = parseCSSTimeList(styles.transitionDuration);
    const delays = parseCSSTimeList(styles.transitionDelay);
    const transitionMs = durations.reduce((maximum, duration, index) => (
        Math.max(maximum, duration + (delays[index % delays.length] || 0))
    ), 0);
    window.setTimeout(remove, transitionMs + 50);
}

function parseCSSTimeList(value) {
    return String(value || '0s').split(',').map(part => {
        const time = part.trim();
        const numericValue = Number.parseFloat(time) || 0;
        return time.endsWith('ms') ? numericValue : numericValue * 1000;
    });
}

// ── Settings ───────────────────────────────────────────────

async function loadSettings() {
    const s = await GetSettings();
    state.currentFontSize = s.fontSize || DEFAULT_CONTENT_FONT_SIZE;
    state.currentMarkdownEngine = s.engine || "marked";
    state.currentEngine = state.currentMarkdownEngine;
    state.currentEditorRenderMode = s.editorRenderMode || "realtime";
    state.editorToolbarMode = ["beginner", "rookie", "pro"].includes(s.editorToolbarMode) ? s.editorToolbarMode : "beginner";
    state.editorAuthor = s.editorAuthor || "";
    state.editorOrderedListStyle = s.editorOrderedListStyle === "incremental" ? "incremental" : "standard";
    state.lastVersion = s.lastVersion || "";
    state.updateCheckInterval = ['never', 'daily', 'weekly', 'monthly'].includes(s.updateCheckInterval)
        ? s.updateCheckInterval
        : 'weekly';
    state.lastUpdateCheck = s.lastUpdateCheck || "";
    state.fileTreeFilterEnabled = !!s.fileTreeFilterEnabled;
    state.recentFileDisplayLimit = clampRecentFileDisplayLimit(s.recentFileDisplayLimit);
    state.outlineHeadingFormatEnabled = !!s.outlineHeadingFormat;
    const accentSettings = resolveAccentSettings(s);
    state.lightAccentColor = accentSettings.light;
    state.darkAccentColor = accentSettings.dark;
    loadScrollbarVisibility(s);
    loadMainToolbarVisibility(s);
    loadThemeMode(s);
    state.documentMargin = s.documentMargin || "none";
    state.viewerFontFamily = s.viewerFontFamily || "";

    applyThemeMode(state.themeMode);
    setEditorTheme(resolveEffectiveTheme(state.themeMode) === 'dark');
    syncThemeSettingsControls();
    if (window.matchMedia && !window._themeMediaListenerBound) {
        window._themeMediaListenerBound = true;
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (state.themeMode === 'auto') {
                applyThemeMode('auto');
                setEditorTheme(resolveEffectiveTheme('auto') === 'dark');
                syncThemeSettingsControls();
            }
        });
    }
    applyDocumentMarginStyle(state.documentMargin);
    applyViewerFontFamily(state.viewerFontFamily);
    if (el.recentLimitInput) {
        el.recentLimitInput.value = String(state.recentFileDisplayLimit);
    }
    applyEditorPreferencesFromSettings(s);
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

function updateLinuxInstallLink(runningOnLinux) {
    el.footerInstall?.classList.toggle('hidden', !runningOnLinux);
    el.footerInstallDot?.classList.toggle('hidden', !runningOnLinux);
}

function openSystemInstallModal() {
    if (!isLinux() || !el.systemInstallModal) {
        return;
    }
    if (el.systemInstallMessage) {
        el.systemInstallMessage.textContent = '';
        el.systemInstallMessage.classList.remove('is-error');
    }
    el.systemInstallModal.classList.remove('hidden');
}

function closeSystemInstallModal() {
    el.systemInstallModal?.classList.add('hidden');
}

async function runSystemIntegration(action) {
    if (!el.systemInstallMessage) {
        return;
    }

    const buttons = [el.systemInstallRun, el.systemInstallRemove].filter(Boolean);
    buttons.forEach(button => {
        button.disabled = true;
    });
    el.systemInstallMessage.classList.remove('is-error');
    el.systemInstallMessage.textContent = 'Working...';

    try {
        el.systemInstallMessage.textContent = await action();
    } catch (error) {
        el.systemInstallMessage.classList.add('is-error');
        el.systemInstallMessage.textContent = String(error);
    } finally {
        buttons.forEach(button => {
            button.disabled = false;
        });
    }
}

async function persist() {
    await persistAppSettings();
}

function changeFontSize(delta) {
    state.currentFontSize = Math.min(72, Math.max(10, state.currentFontSize + delta));
    el.markdownContainer.style.fontSize = `${state.currentFontSize}px`;
    applyHTMLZoom();
    persist();
}

function toggleTheme() {
    const cycle = { auto: 'light', light: 'dark', dark: 'auto' };
    const nextMode = cycle[state.themeMode] || 'auto';
    applyThemeMode(nextMode);
    setEditorTheme(resolveEffectiveTheme(nextMode) === 'dark');
    syncThemeSettingsControls();
    void persistAppSettings();
    showToast(`Theme: ${nextMode.charAt(0).toUpperCase() + nextMode.slice(1)}`, 'contrast');
}

async function printRenderedMarkdown() {
    if (!el.markdownContainer || el.markdownContainer.classList.contains('hidden')) {
        showToast('Open a Markdown file before printing.');
        return;
    }

    try {
        await printForCurrentPlatform(PrintCurrentWindow);
    } catch (err) {
        console.error('Print failed:', err);
        showToast('Failed to open print dialog.');
    }
}

async function showPageSetup() {
    try {
        await ShowPageSetup();
    } catch (err) {
        console.error('Page setup failed:', err);
        showToast('Failed to open page setup.');
    }
}

// ── Toolbar Binding ────────────────────────────────────────

function bindToolbar() {
    el.btnOpen.onclick = handleOpenFile;
    el.btnBack.onclick = goBack;
    el.btnForward.onclick = goForward;
    el.btnHome.onclick = goHome;
    el.btnRefresh.onclick = reloadCurrent;
    el.btnPrint.onclick = printRenderedMarkdown;
    if (el.btnInfo) {
        el.btnInfo.onclick = () => openThirdPartyNotices(true);
    }
    el.btnFontMinus.onclick = () => changeFontSize(-2);
    el.btnFontPlus.onclick = () => changeFontSize(2);
    el.btnThemeToggle.onclick = toggleTheme;
    el.btnNewTab.onclick = () => createAndSwitchToNewTab();
    el.btnNewDoc.onclick = createNewDocument;
    el.btnEdit.onclick = enterEditMode;
    el.btnTranslate.onclick = () => {
        if (el.btnTranslate.classList.contains('ai-required-disabled')) return;
        void translateViewerDocument();
    };
    if (el.btnMobileToolbarMore && el.mobileToolbarMenu) {
        const closeMobileMenu = () => {
            el.mobileToolbarMenu.classList.add('hidden');
            el.mobileToolbarBackdrop?.classList.add('hidden');
        };

        const openMobileMenu = () => {
            el.mobileToolbarMenu.classList.remove('hidden');
            el.mobileToolbarBackdrop?.classList.remove('hidden');
        };

        el.btnMobileToolbarMore.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (el.mobileToolbarMenu.classList.contains('hidden')) {
                openMobileMenu();
            } else {
                closeMobileMenu();
            }
        });

        if (el.mobileToolbarBackdrop) {
            el.mobileToolbarBackdrop.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                closeMobileMenu();
            });
            el.mobileToolbarBackdrop.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                e.preventDefault();
                closeMobileMenu();
            }, { passive: false });
        }

        el.mobileToolbarMenu.addEventListener('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
            const item = event.target.closest('.mobile-menu-item');
            if (!item) return;
            closeMobileMenu();
            const action = item.dataset.action;
            switch (action) {
                case 'print':
                    printRenderedMarkdown();
                    break;
                case 'new-doc':
                    createNewDocument();
                    break;
                case 'edit':
                    enterEditMode();
                    break;
                case 'translate':
                    void translateViewerDocument();
                    break;
                case 'font-minus':
                    changeFontSize(-2);
                    break;
                case 'font-plus':
                    changeFontSize(2);
                    break;
                case 'theme':
                    toggleTheme();
                    break;
                case 'settings':
                    openSettings();
                    break;
            }
        });
    }

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
    el.btnProgressCancel.onclick = cancelCurrentTask;
    el.editPreviewReturn.onclick = () => restoreEditingPreview();
    el.editPreviewOpenTab.onclick = () => openEditingPreviewInNewTab();
    document.addEventListener('keydown', handleGlobalKeydown, true);
    bindHistoryMouseNavigation(document);
    bindNativeHistoryNavigation(window);
    bindEditorEvents();
}

// ── Home Screen Binding ────────────────────────────────────

function bindHomeScreen() {
    el.btnOpenHome.onclick = handleOpenFile;

    el.btnClearRecent.onclick = async () => {
        await ClearRecentFiles();
        await renderRecentFiles();
        showToast('Cleared unpinned recent files.', 'delete');
    };

    el.recentLimitInput?.addEventListener('change', async () => {
        state.recentFileDisplayLimit = clampRecentFileDisplayLimit(el.recentLimitInput.value);
        el.recentLimitInput.value = String(state.recentFileDisplayLimit);
        await persistAppSettings({ recentFileDisplayLimit: state.recentFileDisplayLimit });
        await renderRecentFiles();
    });

    el.recentList.addEventListener('click', async event => {
        const pinButton = event.target.closest('.recent-pin-btn');
        if (pinButton) {
            const item = pinButton.closest('.recent-item');
            if (!item) return;
            const willPin = !pinButton.classList.contains('active');
            await ToggleRecentFilePinned(item.dataset.path);
            await renderRecentFiles();
            showToast(willPin ? 'Pinned to top.' : 'Unpinned from top.', willPin ? 'bookmark_star' : 'bookmark_remove');
            return;
        }

        const item = event.target.closest('.recent-item');
        if (!item) return;
        await openRecentFile(item.dataset.path);
    });

    el.searchResults.addEventListener('click', async event => {
        const item = event.target.closest('.result-item');
        if (!item) return;

        if (window.innerWidth <= 768) {
            const { closeSidebar } = await import('./main-sidebar.js');
            closeSidebar();
        }

        const targetPath = item.dataset.path;
        const targetLine = Number(item.dataset.line) || 1;
        const targetKeyword = item.dataset.keyword || "";
        const targetMatchIndex = Number(item.dataset.matchIndex) || 0;

        setTimeout(async () => {
            if (isMobilePlatform() || window.innerWidth <= 768) {
                if (targetPath) {
                    const { switchToTabByPath, getActiveTab } = await import('./main-tabs.js');
                    const activeTab = getActiveTab();
                    if (activeTab && activeTab.path !== targetPath) {
                        await switchToTabByPath(targetPath);
                    }
                }
                if (state.isEditing) {
                    scrollEditorToLine(targetLine);
                } else {
                    applyHighlight(targetKeyword, targetMatchIndex);
                    scrollPreviewHeadingToTop(targetLine);
                }
                return;
            }
            openPath(targetPath, {
                pushHistory: true,
                keyword: targetKeyword,
                newTab: event.metaKey || event.ctrlKey || state.isEditing,
            });
        }, 60);
    });
    el.searchResults.addEventListener('keydown', event => {
        const item = event.target.closest('.result-item');
        if (!item) return;

        const items = Array.from(el.searchResults.querySelectorAll('.result-item'));
        const index = items.indexOf(item);
        if (index === -1) return;

        let nextIndex = -1;
        if (event.key === 'ArrowDown') nextIndex = Math.min(index + 1, items.length - 1);
        if (event.key === 'ArrowUp') nextIndex = Math.max(index - 1, 0);
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = items.length - 1;

        if (nextIndex !== -1) {
            event.preventDefault();
            items[nextIndex]?.focus();
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            item.click();
        }
    });
 
    el.homeScreen?.addEventListener('click', async (event) => {
        const target = event.target.closest('.footer-link');
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        const id = target.id;
        if (id === 'footer-whats-new') {
            await openWhatsNew(true);
        } else if (id === 'footer-features') {
            await openFeatures(true);
        } else if (id === 'footer-shortcuts') {
            await openShortcuts(true);
        } else if (id === 'footer-third-party-notices') {
            await openThirdPartyNotices(true);
        } else if (id === 'footer-copyright') {
            await openAbout(true);
        }
    });
}

async function openRecentFile(path) {
    const normalizedPath = normalizeFileURLPath(path);
    const openTab = state.tabs.find(tab => {
        const tabPath = normalizeFileURLPath(tab.editingSourcePath || tab.path || "");
        return tabPath === normalizedPath;
    });
    if (openTab) {
        await switchToTab(openTab.id);
        return;
    }
    await openPath(normalizedPath, { pushHistory: true, setHome: true });
}

function clampRecentFileDisplayLimit(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return 8;
    }
    return Math.min(99, Math.max(0, parsed));
}

function bindSystemInstallModal() {
    if (el.footerInstall) {
        el.footerInstall.onclick = (e) => {
            e.preventDefault();
            openSystemInstallModal();
        };
    }

    el.systemInstallRun?.addEventListener('click', () => runSystemIntegration(InstallSystemIntegration));
    el.systemInstallRemove?.addEventListener('click', () => runSystemIntegration(UninstallSystemIntegration));
    el.systemInstallClose?.addEventListener('click', closeSystemInstallModal);
    el.systemInstallModal?.addEventListener('click', event => {
        if (event.target === el.systemInstallModal) {
            closeSystemInstallModal();
        }
    });
}

// ── Drag and Drop ──────────────────────────────────────────

function setupDragAndDrop() {
    OnFileDrop(async (_x, _y, files) => {
        if (!Array.isArray(files) || files.length === 0) {
            return;
        }

        const path = files[0];
        try {
            const result = await HandleFileDrop(path);
            if (result && result.path) {
                await openPath(result.path, {
                    pushHistory: true,
                    setHome: true,
                    content: result.content,
                    newTab: shouldOpenAdditionalFileInNewTab(),
                });
            }
        } catch (err) {
            console.error(err);
        }
    }, false);
}

// ── Menu Events ────────────────────────────────────────────

function bindMenuEvents() {
    EventsOn('menu:new-window', () => createAndSwitchToNewTab());
    EventsOn('menu:reopen-closed-tab', () => reopenClosedTab());
    EventsOn('menu:new-document', () => createNewDocument());
    EventsOn('menu:ask-ai', () => showAskAIPrompt());
    EventsOn('menu:home', () => goHome());
    EventsOn('menu:back', () => goBack());
    EventsOn('menu:forward', () => goForward());
    EventsOn('menu:open-file', () => handleOpenFile());
    EventsOn('menu:page-setup', () => showPageSetup());
    EventsOn('menu:print', () => printRenderedMarkdown());
    EventsOn('menu:refresh', () => reloadCurrent());
    EventsOn('system:open-file', async path => openIncomingFiles([path]));
    EventsOn('menu:toggle-search', () => toggleSearch());
    EventsOn('menu:toggle-editor-preview', () => toggleEditorPreview());
    EventsOn('menu:save', async () => {
        if (state.isEditing) {
            await saveCurrentDocument({ confirm: false, exitAfterSave: false });
        }
    });
    EventsOn('menu:save-as', async () => {
        if (state.isEditing) {
            await saveCurrentDocumentAs();
        }
    });
    EventsOn('menu:toggle-sidebar', () => toggleSidebar());
    EventsOn('menu:toggle-files-sidebar', () => toggleSidebarTab('files', { focusTab: true }));
    EventsOn('menu:toggle-outline-sidebar', () => toggleSidebarTab('outline', { focusTab: true }));
    EventsOn('menu:toggle-search-sidebar', () => toggleSidebarTab('search', { focusSearchInput: true }));
    EventsOn('menu:toggle-theme', () => toggleTheme());
    EventsOn('menu:font-up', () => changeFontSize(2));
    EventsOn('menu:font-down', () => changeFontSize(-2));
    EventsOn('menu:font-reset', () => {
        state.currentFontSize = DEFAULT_CONTENT_FONT_SIZE;
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
    const isAskAIShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && (event.key === '/' || event.code === 'Slash');
    const isEditorFontDownShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && (event.key === '-' || event.key === '_' || event.code === 'Minus' || event.code === 'NumpadSubtract');
    const isEditorFontUpShortcut = (event.metaKey || event.ctrlKey) && !event.altKey
        && (
            event.key === '+' ||
            event.key === '=' ||
            event.code === 'Equal' ||
            event.code === 'NumpadAdd'
        );
    const isEditorFontResetShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0');
    const isSidebarTabShortcut = event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey
        && (
            event.code === 'Digit1' ||
            event.code === 'Digit2' ||
            event.code === 'Digit3' ||
            event.code === 'Numpad1' ||
            event.code === 'Numpad2' ||
            event.code === 'Numpad3'
        );
    const isSidebarToggleShortcut = event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey
        && (event.key.toLowerCase() === 's' || event.code === 'KeyS');
    const isSearchShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && event.key.toLowerCase() === 'f';
    const isNewTabShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && event.key.toLowerCase() === 't';
    const isReopenClosedTabShortcut = (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey
        && event.key.toLowerCase() === 't';
    const isNewDocumentShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && event.key.toLowerCase() === 'n';
    const isToggleThemeShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && event.key.toLowerCase() === 'k';
    const isEditorPreviewShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && event.key.toLowerCase() === 'g';

    // 편집 가능한 요소(textarea, input)에 포커스가 있을 때
    // Cmd+W(isEditingShortcut), Cmd+A, Cmd+C 등의 글로벌 단축키가 아니라면
    // 브라우저 기본 동작에 맡기고 글로벌 단축키 처리를 건너뜁니다.
    if (isEditableTarget(event.target)) {
        const isGlobalKey = (event.metaKey || event.ctrlKey)
            && (['w', 's', 'e', 'f', 't', 'n', 'k'].includes(event.key.toLowerCase()) || /^[1-9]$/.test(event.key) || isAskAIShortcut || isReopenClosedTabShortcut || isEditorFontDownShortcut || isEditorFontUpShortcut || isEditorFontResetShortcut || isEditorPreviewShortcut);
        if (isSidebarTabShortcut) {
            event.preventDefault();
            toggleSidebarTabFromShortcut(event.code);
            return;
        }
        if (isSidebarToggleShortcut) {
            event.preventDefault();
            toggleSidebar();
            return;
        }
        if (!isGlobalKey) {
            return;
        }
    }

    if (isSidebarToggleShortcut) {
        event.preventDefault();
        toggleSidebar();
        return;
    }

    if (isSidebarTabShortcut) {
        event.preventDefault();
        toggleSidebarTabFromShortcut(event.code);
        return;
    }

    if (isSearchShortcut) {
        event.preventDefault();
        toggleSearch();
        return;
    }

    if (isNewTabShortcut) {
        event.preventDefault();
        await createAndSwitchToNewTab();
        return;
    }

    if (isReopenClosedTabShortcut) {
        event.preventDefault();
        await reopenClosedTab();
        return;
    }

    if (isNewDocumentShortcut) {
        event.preventDefault();
        await createNewDocument();
        return;
    }

    if (isToggleThemeShortcut) {
        event.preventDefault();
        toggleTheme();
        return;
    }

    if (isEditorPreviewShortcut && state.isEditing) {
        event.preventDefault();
        toggleEditorPreview();
        return;
    }

    if (isEditorFocused() && (isEditorFontDownShortcut || isEditorFontUpShortcut || isEditorFontResetShortcut)) {
        event.preventDefault();
        if (isEditorFontResetShortcut) {
            resetEditorFontSize();
        } else {
            changeEditorFontSize(isEditorFontDownShortcut ? -1 : 1);
        }
        return;
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
        if (!state.isEditing) {
            return;
        }
        event.preventDefault();
        await saveCurrentDocumentAs();
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

    if (isAskAIShortcut) {
        event.preventDefault();
        showAskAIPrompt();
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

function sidebarTabFromShortcut(code) {
    if (code === 'Digit1' || code === 'Numpad1') return 'files';
    if (code === 'Digit2' || code === 'Numpad2') return 'outline';
    return 'search';
}

function toggleSidebarTabFromShortcut(code) {
    const tabId = sidebarTabFromShortcut(code);
    toggleSidebarTab(tabId, tabId === 'search' ? { focusSearchInput: true } : { focusTab: true });
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
