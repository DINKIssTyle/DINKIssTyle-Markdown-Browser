/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import {
    state, el, HOME_SCREEN_PATH,
    kindFromPath, documentTypeFromPath, escapeHTML,
    syncEngineSelector, getPathDirname, getScroller,
} from './main-state.js';
import { renderActiveTab } from './main-render.js';
import { exitEditMode } from './main-editor.js';
import { openPath } from './main-navigation.js';
import { showToast } from './main-ui.js';
import { AskSaveDiscardCancel, SaveFile } from '../wailsjs/go/main/App';
import { LogError } from '../wailsjs/runtime/runtime';

// ── Module-level State ─────────────────────────────────────
let draggedTabId = "";

// ── Tab CRUD ───────────────────────────────────────────────

export function createTab({ path = HOME_SCREEN_PATH, title = 'New Tab' } = {}) {
    return {
        id: `tab-${state.nextTabID++}`,
        path,
        kind: kindFromPath(path),
        documentType: documentTypeFromPath(path),
        title,
        navHistory: [{ path, scroll: 0 }],
        navIndex: 0,
        homeTargetPath: path === HOME_SCREEN_PATH ? HOME_SCREEN_PATH : path,
        currentMarkdownSource: "",
        isEditing: false,
        editorOriginalContent: "",
        pendingKeyword: "",
        pendingAnchor: "",
    };
}

export function getActiveTab() {
    return state.tabs.find(tab => tab.id === state.activeTabId) || null;
}

export function syncTabFromGlobals(tab) {
    if (!tab) return;
    tab.path = state.currentFilePath;
    tab.kind = kindFromPath(state.currentFilePath);
    tab.documentType = state.currentDocumentType;
    tab.currentFolder = state.currentFolder;
    tab.currentMarkdownSource = state.currentMarkdownSource;
    tab.isEditing = state.isEditing;
    tab.editorOriginalContent = state.editorOriginalContent;
    tab.navHistory = state.navHistory.map(item => ({ ...item }));
    tab.navIndex = state.navIndex;
    tab.homeTargetPath = state.homeTargetPath;
    tab.pendingKeyword = state.pendingKeyword;
    tab.pendingAnchor = state.pendingAnchor;
}

export function syncGlobalsFromTab(tab) {
    if (!tab) return;
    state.currentFilePath = tab.path;
    state.currentDocumentType = tab.documentType || documentTypeFromPath(tab.path);
    state.currentFolder = tab.currentFolder || getPathDirname(tab.path);
    state.currentMarkdownSource = tab.currentMarkdownSource || "";
    state.isEditing = !!tab.isEditing;
    state.editorOriginalContent = tab.editorOriginalContent || "";
    state.navHistory = (tab.navHistory || [{ path: tab.path, scroll: 0 }]).map(item => ({ ...item }));
    state.navIndex = typeof tab.navIndex === "number" ? tab.navIndex : state.navHistory.length - 1;
    state.homeTargetPath = tab.homeTargetPath || HOME_SCREEN_PATH;
    state.pendingKeyword = tab.pendingKeyword || "";
    state.pendingAnchor = tab.pendingAnchor || "";
    syncEngineSelector();
}

export function saveCurrentScroll() {
    const tab = getActiveTab();
    if (!tab || state.navIndex < 0 || state.navIndex >= state.navHistory.length) {
        return;
    }
    state.navHistory[state.navIndex].scroll = getScroller().scrollTop;
    syncTabFromGlobals(tab);
}

// ── Tab Switching ──────────────────────────────────────────

export async function switchToTab(tabID) {
    const nextTab = state.tabs.find(tab => tab.id === tabID);
    if (!nextTab || nextTab.id === state.activeTabId) {
        return;
    }
    saveCurrentScroll();
    state.activeTabId = nextTab.id;
    syncGlobalsFromTab(nextTab);
    renderTabs();
    await renderActiveTab();
}

// ── Tab Rendering ──────────────────────────────────────────

export function renderTabs() {
    el.tabsList.innerHTML = state.tabs.map(tab => `
        <div class="tab-item ${tab.id === state.activeTabId ? 'active' : ''}" data-tab-id="${tab.id}" draggable="true">
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

    const sourceIndex = state.tabs.findIndex(tab => tab.id === sourceTabID);
    const targetIndex = state.tabs.findIndex(tab => tab.id === targetTabID);
    if (sourceIndex === -1 || targetIndex === -1) {
        return;
    }

    const [movedTab] = state.tabs.splice(sourceIndex, 1);
    state.tabs.splice(targetIndex, 0, movedTab);
    renderTabs();
}

// ── Tab Close ──────────────────────────────────────────────

export async function closeTab(tabID) {
    // Check for unsaved changes if editing this tab
    if (state.isEditing && tabID === state.activeTabId) {
        if (el.markdownEditor.value !== state.editorOriginalContent) {
            const response = await AskSaveDiscardCancel("Unsaved Changes", "The document has been modified. Do you want to save changes?");
            
            if (response === "Cancel") return;
            
            if (response === "Save") {
                try {
                    await SaveFile(state.currentFilePath, el.markdownEditor.value);
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

    const idx = state.tabs.findIndex(tab => tab.id === tabID);
    if (idx === -1) return;

    const wasActive = state.tabs[idx].id === state.activeTabId;
    state.tabs.splice(idx, 1);

    if (state.tabs.length === 0) {
        const freshTab = createTab({ path: HOME_SCREEN_PATH, title: 'Start' });
        state.tabs.push(freshTab);
        state.activeTabId = freshTab.id;
        syncGlobalsFromTab(freshTab);
        renderTabs();
        renderActiveTab();
        return;
    }

    if (wasActive) {
        const fallback = state.tabs[Math.max(0, idx - 1)] || state.tabs[0];
        state.activeTabId = fallback.id;
        syncGlobalsFromTab(fallback);
        renderTabs();
        renderActiveTab();
        return;
    }

    renderTabs();
}

// ── New Tab ────────────────────────────────────────────────

export async function createAndSwitchToNewTab(path = HOME_SCREEN_PATH, options = {}) {
    saveCurrentScroll();
    const tab = createTab({
        path,
        title: path === HOME_SCREEN_PATH ? 'Start' : 'Loading...',
    });
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    syncGlobalsFromTab(tab);
    renderTabs();
    await openPath(path, { ...options, pushHistory: false, tabId: tab.id });
}

export function activateTabByShortcut(index) {
    if (state.tabs.length === 0) {
        return;
    }

    const targetIndex = index === 9 ? state.tabs.length - 1 : index - 1;
    const tab = state.tabs[targetIndex];
    if (tab) {
        switchToTab(tab.id);
    }
}
