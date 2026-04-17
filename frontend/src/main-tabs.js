/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import {
    state, el, HOME_SCREEN_PATH,
    kindFromPath, documentTypeFromPath, escapeHTML, formatSaveDialogMessage,
    syncEngineSelector, getPathDirname, getScroller,
} from './main-state.js';
import { renderActiveTab } from './main-render.js';
import { exitEditMode, hasUnsavedEditorChanges, hasUnsavedTabChanges, saveCurrentDocument, saveTabDocument, syncEditorSessionFromState } from './main-editor.js';
import { openPath } from './main-navigation.js';
import { showToast } from './main-ui.js';
import { AskSaveDiscardCancel } from '../wailsjs/go/main/App';
import { LogError } from '../wailsjs/runtime/runtime';

// ── Module-level State ─────────────────────────────────────
let dragState = null;
let suppressClickUntil = 0;
let dragBindingsReady = false;

// ── Tab CRUD ───────────────────────────────────────────────

export function createTab({ path = HOME_SCREEN_PATH, title = 'New Tab' } = {}) {
    return {
        id: `tab-${state.nextTabID++}`,
        path,
        kind: kindFromPath(path),
        documentType: documentTypeFromPath(path),
        title,
        currentFolder: getPathDirname(path),
        navHistory: [{ path, scroll: 0 }],
        navIndex: 0,
        homeTargetPath: path === HOME_SCREEN_PATH ? HOME_SCREEN_PATH : path,
        currentMarkdownSource: "",
        isEditing: false,
        editorOriginalContent: "",
        editingSourcePath: "",
        editingSourceFolder: "",
        editingPreviewPath: "",
        editingPreviewFolder: "",
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
    tab.editingSourcePath = state.editingSourcePath;
    tab.editingSourceFolder = state.editingSourceFolder;
    tab.editingPreviewPath = state.editingPreviewPath;
    tab.editingPreviewFolder = state.editingPreviewFolder;
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
    state.editingSourcePath = tab.editingSourcePath || "";
    state.editingSourceFolder = tab.editingSourceFolder || "";
    state.editingPreviewPath = tab.editingPreviewPath || "";
    state.editingPreviewFolder = tab.editingPreviewFolder || "";
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
    syncEditorSessionFromState();
    renderTabs();
    await renderActiveTab();
}

// ── Tab Rendering ──────────────────────────────────────────

export function renderTabs() {
    ensureTabDragBindings();

    el.tabsList.innerHTML = state.tabs.map(tab => `
        <div class="tab-item ${tab.id === state.activeTabId ? 'active' : ''}" data-tab-id="${tab.id}">
            <span class="tab-title">${escapeHTML(tab.title || 'Untitled')}</span>
            <button class="tab-close-btn" data-close-tab="${tab.id}" aria-label="Close Tab">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
        </div>
    `).join('');

    el.tabsList.querySelectorAll('.tab-item').forEach(tabNode => {
        tabNode.addEventListener('click', async event => {
            if (Date.now() < suppressClickUntil) {
                event.preventDefault();
                return;
            }
            if (event.target.closest('[data-close-tab]')) {
                return;
            }
            await switchToTab(tabNode.dataset.tabId);
        });

        tabNode.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('[data-close-tab]')) {
                return;
            }
            beginPointerDrag(tabNode, event);
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

function ensureTabDragBindings() {
    if (dragBindingsReady) {
        return;
    }

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', cancelPointerDrag);
    dragBindingsReady = true;
}

function beginPointerDrag(tabNode, event) {
    const tabId = tabNode.dataset.tabId;
    let sourceNode = tabNode;

    if (tabId !== state.activeTabId) {
        const nextTab = state.tabs.find(tab => tab.id === tabId);
        if (nextTab) {
            saveCurrentScroll();
            state.activeTabId = nextTab.id;
            syncGlobalsFromTab(nextTab);
            syncEditorSessionFromState();
            renderTabs();
            renderActiveTab().catch(error => {
                console.error('Failed to render dragged tab:', error);
            });
            sourceNode = el.tabsList.querySelector(`[data-tab-id="${tabId}"]`);
        }
    }

    if (!sourceNode) {
        return;
    }

    const stripRect = el.tabsList.getBoundingClientRect();
    const fixedY = stripRect.top + stripRect.height / 2;
    const tabRect = sourceNode.getBoundingClientRect();
    dragState = {
        tabId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: fixedY,
        lastX: event.clientX,
        lastY: fixedY,
        sourceNode,
        placeholderNode: null,
        pointerOffsetX: event.clientX - tabRect.left,
        insertionIndex: state.tabs.findIndex(tab => tab.id === tabId),
        isDragging: false,
    };
}

function handlePointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
    }

    dragState.lastX = event.clientX;
    dragState.lastY = dragState.startY;

    if (!dragState.isDragging) {
        // X축 거리만으로 드래그 시작 판정 (레일 방식: 좌우 이동만 감지)
        const distanceX = Math.abs(event.clientX - dragState.startX);
        if (distanceX < 6) {
            return;
        }
        startVisualDrag();
    }

    event.preventDefault();
    updateDraggedTabPosition(event.clientX);
    updateDropIndicator(event.clientX, dragState.startY);
    autoScrollTabs(event.clientX);
}

async function handlePointerUp(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
    }

    const { tabId, insertionIndex, isDragging } = dragState;

    cleanupPointerDrag();

    if (isDragging) {
        await moveTabToIndex(tabId, insertionIndex);
        suppressClickUntil = Date.now() + 250;
    }
}

function cancelPointerDrag() {
    if (!dragState) {
        return;
    }
    cleanupPointerDrag();
}

function startVisualDrag() {
    if (!dragState?.sourceNode) {
        return;
    }

    dragState.isDragging = true;
    dragState.sourceNode.classList.add('dragging');

    // 드래그 시작 시점에 탭 스트립 Y좌표 재계산 (레이아웃 변경 대응)
    const stripRect = el.tabsList.getBoundingClientRect();
    dragState.startY = stripRect.top + stripRect.height / 2;

    const rect = dragState.sourceNode.getBoundingClientRect();
    const placeholderNode = document.createElement('div');
    placeholderNode.className = 'tab-drag-placeholder';
    placeholderNode.style.width = `${rect.width}px`;
    placeholderNode.style.height = `${rect.height}px`;
    dragState.sourceNode.insertAdjacentElement('afterend', placeholderNode);
    dragState.placeholderNode = placeholderNode;

    dragState.sourceNode.style.width = `${rect.width}px`;
    dragState.sourceNode.style.height = `${rect.height}px`;
    dragState.sourceNode.style.left = `${rect.left}px`;
    dragState.sourceNode.style.top = `${rect.top}px`;
    document.body.appendChild(dragState.sourceNode);

    updateDraggedTabPosition(dragState.lastX);
    updateDropIndicator(dragState.lastX, dragState.startY);
}

function updateDraggedTabPosition(clientX) {
    if (!dragState?.sourceNode) {
        return;
    }

    const sourceNode = dragState.sourceNode;
    const height = sourceNode.offsetHeight;
    sourceNode.style.left = `${clientX - dragState.pointerOffsetX}px`;
    sourceNode.style.top = `${dragState.startY - height / 2}px`;
}

function updateDropIndicator(clientX, clientY) {
    clearDropIndicators();

    const sourceNode = dragState?.sourceNode;
    const placeholderNode = dragState?.placeholderNode;
    if (!dragState?.isDragging || !sourceNode || !placeholderNode) {
        return;
    }

    const otherNodes = [...el.tabsList.querySelectorAll('.tab-item')]
        .filter(node => node.dataset.tabId !== dragState.tabId);

    if (otherNodes.length === 0) {
        dragState.insertionIndex = 0;
        el.tabsList.appendChild(placeholderNode);
        dragState.sourceNode.classList.add('drag-lifted');
        return;
    }

    let insertionIndex = otherNodes.length;
    let anchorNode = otherNodes[otherNodes.length - 1];
    let insertBefore = false;

    for (let i = 0; i < otherNodes.length; i += 1) {
        const node = otherNodes[i];
        const rect = node.getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) {
            insertionIndex = i;
            anchorNode = node;
            insertBefore = true;
            break;
        }
    }

    dragState.insertionIndex = insertionIndex;
    if (insertBefore) {
        anchorNode.insertAdjacentElement('beforebegin', placeholderNode);
    } else {
        anchorNode.insertAdjacentElement('afterend', placeholderNode);
    }
    dragState.sourceNode.classList.add('drag-lifted');
}

function clearDropIndicators() {
    el.tabsList.querySelectorAll('.tab-item.drag-lifted')
        .forEach(node => node.classList.remove('drag-lifted'));
}

function cleanupPointerDrag() {
    clearDropIndicators();
    if (dragState?.sourceNode) {
        dragState.sourceNode.classList.remove('dragging');
        dragState.sourceNode.style.removeProperty('width');
        dragState.sourceNode.style.removeProperty('height');
        dragState.sourceNode.style.removeProperty('left');
        dragState.sourceNode.style.removeProperty('top');
        dragState.placeholderNode?.insertAdjacentElement('beforebegin', dragState.sourceNode);
    }
    dragState?.placeholderNode?.remove();
    dragState = null;
}

function autoScrollTabs(clientX) {
    const rect = el.tabsList.getBoundingClientRect();
    const edgeSize = 48;
    if (clientX < rect.left + edgeSize) {
        el.tabsList.scrollLeft -= 14;
    } else if (clientX > rect.right - edgeSize) {
        el.tabsList.scrollLeft += 14;
    }
}

async function moveTabToIndex(sourceTabID, insertionIndex) {
    if (!sourceTabID) {
        return;
    }

    const sourceIndex = state.tabs.findIndex(tab => tab.id === sourceTabID);
    if (sourceIndex === -1) {
        return;
    }

    const [movedTab] = state.tabs.splice(sourceIndex, 1);
    const boundedIndex = Math.max(0, Math.min(insertionIndex, state.tabs.length));
    state.tabs.splice(boundedIndex, 0, movedTab);

    if (state.activeTabId === movedTab.id) {
        renderTabs();
        return;
    }

    saveCurrentScroll();
    state.activeTabId = movedTab.id;
    syncGlobalsFromTab(movedTab);
    syncEditorSessionFromState();
    renderTabs();
    await renderActiveTab();
}

// ── Tab Close ──────────────────────────────────────────────

export async function closeTab(tabID) {
    const tab = state.tabs.find(item => item.id === tabID);
    if (!tab) return;

    const isActiveEditingTab = tabID === state.activeTabId && state.isEditing;
    const hasUnsavedChanges = isActiveEditingTab ? hasUnsavedEditorChanges() : hasUnsavedTabChanges(tab);

    if ((isActiveEditingTab || tab.isEditing) && hasUnsavedChanges) {
        const response = await AskSaveDiscardCancel("Unsaved Changes", formatSaveDialogMessage(tab.title, "The document has been modified. Do you want to save changes?"));
        if (response === "Cancel") return;

        if (response === "Save") {
            const saved = isActiveEditingTab
                ? await saveCurrentDocument({ confirm: false, exitAfterSave: false })
                : await saveTabDocument(tab, { confirm: false });

            if (!saved) {
                LogError(`Auto-save on close failed: ${tab.path}`);
                return;
            }
        }
    }

    if (isActiveEditingTab) {
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
    // 편집 중인 탭의 상태를 보존
    const currentTab = getActiveTab();
    if (currentTab) {
        syncTabFromGlobals(currentTab);
    }
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
