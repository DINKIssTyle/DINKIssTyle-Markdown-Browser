/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import {
    state, el, HOME_SCREEN_PATH,
    kindFromPath, documentTypeFromPath, normalizeFileURLPath, escapeHTML, formatSaveDialogMessage,
    syncEngineSelector, getPathDirname, getScroller, basename,
} from './main-state.js';
import { renderActiveTab } from './main-render.js';
import { clearTransientEditorOverlays, exitEditMode, getEditorScrollSnapshot, getEditorSelectionSnapshot, getEditorStateSnapshot, getEditorTopLineSnapshot, hasUnsavedEditorChanges, hasUnsavedTabChanges, saveCurrentDocument, saveTabDocument, syncEditorSessionFromState } from './main-editor.js';
import { syncEditorStateToBackend } from './main-session.js';
import { openPath } from './main-navigation.js';
import { showToast } from './main-ui.js';
import { createTabListView } from './tab-list-view.js';
import { AskSaveDiscardCancel } from '../bindings/dinkisstyle-markdown-browser/internal/app/app';
import { LogError } from './wails-runtime';
import { MOBILE_UNTITLED_PATH } from './platform-common.js';

// ── Module-level State ─────────────────────────────────────
let dragState = null;
let suppressClickUntil = 0;
let dragBindingsReady = false;
let desktopTabView = null;
let mobileTabView = null;
const closingTabIds = new Set();
const pendingCloseTabIds = new Set();
const closedTabs = [];
const MAX_CLOSED_TABS = 20;

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
        editorSelection: null,
        editorScrollTop: 0,
        editorTopLine: 1,
        editorSelections: {},
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
    tab.editorSelection = getEditorSelectionSnapshot() || state.editorSelection || null;
    tab.editorScrollTop = state.isEditing && tab.id === state.activeTabId
        ? getEditorScrollSnapshot()
        : state.editorScrollTop || tab.editorScrollTop || 0;
    tab.editorTopLine = state.isEditing && tab.id === state.activeTabId
        ? getEditorTopLineSnapshot()
        : state.editorTopLine || tab.editorTopLine || 1;
    const editorState = getEditorStateSnapshot();
    if (state.isEditing && tab.id === state.activeTabId && editorState) {
        tab.editorState = editorState;
    }
    tab.editorSelections = tab.editorSelections || {};
    const editorSelectionKey = state.editingSourcePath || state.currentFilePath;
    if (editorSelectionKey && tab.editorSelection) {
        tab.editorSelections[editorSelectionKey] = tab.editorSelection;
    }
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
    tab.editorSelections = tab.editorSelections || {};
    state.editorSelection = tab.editorSelections[tab.editingSourcePath || tab.path] || tab.editorSelection || null;
    state.editorScrollTop = Number.isFinite(tab.editorScrollTop) ? tab.editorScrollTop : 0;
    state.editorTopLine = Number.isFinite(tab.editorTopLine) ? tab.editorTopLine : 1;
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
    if (!tab) return;
    if (state.navIndex >= 0 && state.navIndex < state.navHistory.length) {
        state.navHistory[state.navIndex].scroll = getScroller().scrollTop;
    }
    if (state.isEditing) {
        state.editorScrollTop = getEditorScrollSnapshot();
        state.editorTopLine = getEditorTopLineSnapshot();
        tab.editorScrollTop = state.editorScrollTop;
        tab.editorTopLine = state.editorTopLine;
    }
    syncTabFromGlobals(tab);
}

// ── Tab Switching ──────────────────────────────────────────

// All activation paths restore the same editor session and transient UI.
function activateTab(tab, { preserveCurrent = true, renderDocument = true } = {}) {
    clearTransientEditorOverlays();
    if (preserveCurrent) saveCurrentScroll();
    state.activeTabId = tab.id;
    syncGlobalsFromTab(tab);
    syncEditorSessionFromState();
    syncEditorStateToBackend();
    renderTabs();
    return renderDocument ? renderActiveTab() : Promise.resolve();
}

export async function switchToTab(tabID) {
    const nextTab = state.tabs.find(tab => tab.id === tabID);
    if (!nextTab || pendingCloseTabIds.has(tabID) || nextTab.id === state.activeTabId) return;
    await activateTab(nextTab);
}

export function findTabByPath(path) {
    if (!path) return null;
    const normalized = normalizeFileURLPath(path);
    return state.tabs.find(tab =>
        normalizeFileURLPath(tab.editingSourcePath || tab.path || '') === normalized
    ) || null;
}

function isPhoneScreen() {
    return window.innerWidth <= 768;
}

// ── Tab Rendering ──────────────────────────────────────────

export function renderTabs() {
    ensureTabDragBindings();
    ensureMobileTabsModalBindings();
    // A structural refresh must not leave a dragged node attached to body.
    if (dragState?.isDragging) cleanupPointerDrag();

    if (isPhoneScreen()) {
        desktopTabView?.dispose();
        desktopTabView = null;
        const activeTab = getActiveTab() || state.tabs[0];
        if (!activeTab) return;
        const dirty = shouldShowUnsavedWarning(activeTab);
        el.tabsList.innerHTML = `
            <div class="tab-item active mobile-single-tab ${dirty ? 'has-unsaved-changes' : ''}" data-tab-id="${activeTab.id}">
                <div class="tab-container">
                    <span class="tab-title">${escapeHTML(activeTab.title || 'Untitled')}</span>
                    ${dirty ? '<span class="material-symbols-outlined tab-unsaved-warning" aria-label="Unsaved changes" title="Unsaved changes">warning</span>' : ''}
                    <div class="mobile-tab-right-group">
                        <span class="mobile-tab-count-badge">${state.tabs.length}</span>
                        <span class="material-symbols-outlined mobile-tab-dropdown-icon">expand_more</span>
                    </div>
                </div>
            </div>
        `;
        el.tabsList.querySelector('.mobile-single-tab').onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            openMobileTabsModal();
        };
        if (el.mobileTabsModal && !el.mobileTabsModal.classList.contains('hidden')) renderMobileTabsList();
        return;
    }

    if (!desktopTabView) {
        el.tabsList.replaceChildren();
        desktopTabView = createTabListView({
            container: el.tabsList,
            createNode: createDesktopTabNode,
            updateNode: updateDesktopTabNode,
        });
    }
    desktopTabView.sync(state.tabs.filter(tab => !closingTabIds.has(tab.id)));
    el.tabsList.querySelector('.tab-item.active[data-tab-id]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function createDesktopTabNode(tab) {
    const node = document.createElement('div');
    node.className = 'tab-item';
    node.dataset.tabId = tab.id;
    node.innerHTML = `
        <div class="tab-container">
            <span class="tab-title"></span>
            <span class="material-symbols-outlined tab-unsaved-warning hidden" aria-label="Unsaved changes" title="Unsaved changes">warning</span>
            <button class="tab-close-btn" aria-label="Close Tab">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
        </div>`;
    const close = node.querySelector('.tab-close-btn');
    close.dataset.closeTab = tab.id;
    close.addEventListener('click', async event => {
        event.stopPropagation();
        await closeTab(tab.id);
    });
    node.addEventListener('click', async event => {
        if (Date.now() < suppressClickUntil) {
            event.preventDefault();
            return;
        }
        if (!event.target.closest('[data-close-tab]')) await switchToTab(tab.id);
    });
    node.addEventListener('pointerdown', event => {
        if (event.button === 0 && !event.target.closest('[data-close-tab]')) beginPointerDrag(node, event);
    });
    return node;
}

function updateDesktopTabNode(node, tab) {
    const dirty = shouldShowUnsavedWarning(tab);
    node.classList.toggle('active', tab.id === state.activeTabId);
    node.classList.toggle('has-unsaved-changes', dirty);
    const title = node.querySelector('.tab-title');
    const text = tab.title || 'Untitled';
    if (title.textContent !== text) title.textContent = text;
    node.querySelector('.tab-unsaved-warning').classList.toggle('hidden', !dirty);
}

let mobileTabsModalBound = false;

function ensureMobileTabsModalBindings() {
    if (mobileTabsModalBound) return;
    if (el.btnCloseMobileTabsModal) {
        el.btnCloseMobileTabsModal.onclick = () => closeMobileTabsModal();
    }
    if (el.mobileTabsModal) {
        el.mobileTabsModal.onclick = (e) => {
            if (e.target === el.mobileTabsModal) closeMobileTabsModal();
        };
    }
    window.addEventListener('resize', () => {
        renderTabs();
    });
    mobileTabsModalBound = true;
}

export function openMobileTabsModal() {
    if (!el.mobileTabsModal || !el.mobileTabsList) return;
    renderMobileTabsList();
    el.mobileTabsModal.classList.remove('hidden');
}

export function closeMobileTabsModal() {
    if (!el.mobileTabsModal) return;
    el.mobileTabsModal.classList.add('hidden');
    mobileTabView?.dispose();
    mobileTabView = null;
}

function renderMobileTabsList() {
    if (!el.mobileTabsList) return;
    if (!mobileTabView) {
        el.mobileTabsList.replaceChildren();
        mobileTabView = createTabListView({
            container: el.mobileTabsList,
            createNode: createMobileTabNode,
            updateNode: updateMobileTabNode,
        });
    }
    mobileTabView.sync(state.tabs.filter(tab => !closingTabIds.has(tab.id)));
}

function createMobileTabNode(tab) {
    const row = document.createElement('div');
    row.className = 'mobile-tab-row';
    row.dataset.tabId = tab.id;
    row.innerHTML = `
        <div class="mobile-tab-info">
            <span class="material-symbols-outlined mobile-tab-icon"></span>
            <span class="mobile-tab-title"></span>
            <span class="material-symbols-outlined tab-unsaved-warning hidden" title="Unsaved changes">warning</span>
        </div>
        <button class="mobile-tab-row-close" title="Close Tab" aria-label="Close Tab">
            <span class="material-symbols-outlined">close</span>
        </button>`;
    const close = row.querySelector('.mobile-tab-row-close');
    close.dataset.closeMobileTab = tab.id;
    close.addEventListener('click', async event => {
        event.stopPropagation();
        await closeTab(tab.id);
        if (!el.mobileTabsModal.classList.contains('hidden')) renderMobileTabsList();
    });
    row.addEventListener('click', async event => {
        if (event.target.closest('[data-close-mobile-tab]')) return;
        closeMobileTabsModal();
        await switchToTab(tab.id);
    });
    return row;
}

function updateMobileTabNode(row, tab) {
    const active = tab.id === state.activeTabId;
    const dirty = shouldShowUnsavedWarning(tab);
    row.classList.toggle('active', active);
    row.classList.toggle('has-unsaved-changes', dirty);
    row.querySelector('.mobile-tab-icon').textContent = active ? 'check_circle' : 'article';
    const title = row.querySelector('.mobile-tab-title');
    const text = tab.title || 'Untitled';
    if (title.textContent !== text) title.textContent = text;
    row.querySelector('.tab-unsaved-warning').classList.toggle('hidden', !dirty);
}

function shouldShowUnsavedWarning(tab) {
    if (tab?.id === state.activeTabId && state.isEditing) {
        return hasUnsavedEditorChanges();
    }
    return hasUnsavedTabChanges(tab);
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
    if (pendingCloseTabIds.has(tabId)) return;
    let sourceNode = tabNode;

    if (tabId !== state.activeTabId) {
        switchToTab(tabId).catch(error => {
            LogError(`Failed to activate dragged tab: ${error?.message || error}`);
        });
        sourceNode = el.tabsList.querySelector(`[data-tab-id="${tabId}"]`);
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
    desktopTabView?.stop(dragState.tabId);
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
        .filter(node => node.dataset.tabId && node.dataset.tabId !== dragState.tabId);

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
    if (!sourceTabID || pendingCloseTabIds.has(sourceTabID)) {
        return;
    }

    const sourceIndex = state.tabs.findIndex(tab => tab.id === sourceTabID);
    if (sourceIndex === -1) {
        return;
    }

    const [movedTab] = state.tabs.splice(sourceIndex, 1);
    const boundedIndex = Math.max(0, Math.min(insertionIndex, state.tabs.length));
    state.tabs.splice(boundedIndex, 0, movedTab);
    syncEditorStateToBackend();

    if (state.activeTabId === movedTab.id) {
        renderTabs();
        return;
    }

    await switchToTab(movedTab.id);
}

// ── Tab Close ──────────────────────────────────────────────

export async function closeTab(tabID) {
    const tab = state.tabs.find(item => item.id === tabID);
    if (!tab || pendingCloseTabIds.has(tabID)) return;

    pendingCloseTabIds.add(tabID);
    try {
        const isActiveEditingTab = tabID === state.activeTabId && state.isEditing;
        const hasUnsavedChanges = isActiveEditingTab ? hasUnsavedEditorChanges() : hasUnsavedTabChanges(tab);

        if ((isActiveEditingTab || tab.isEditing) && hasUnsavedChanges) {
            const response = await AskSaveDiscardCancel("Unsaved Changes", formatSaveDialogMessage(tab.title, "The document has been modified. Do you want to save changes?"));
            if (response !== "Save" && response !== "Discard") return;

            if (response === "Save") {
                const saved = tabID === state.activeTabId && state.isEditing
                    ? await saveCurrentDocument({ confirm: false, exitAfterSave: false })
                    : await saveTabDocument(tab, { confirm: false });

                if (!saved) {
                    LogError(`Auto-save on close failed: ${tab.path}`);
                    return;
                }
                // Edits made while the save was in flight still need a decision.
                if (tabID === state.activeTabId ? hasUnsavedEditorChanges() : hasUnsavedTabChanges(tab)) return;
            }
        }

        if (tabID === state.activeTabId && state.isEditing) {
            clearTransientEditorOverlays();
            await exitEditMode(false);
        }

        let idx = state.tabs.findIndex(tab => tab.id === tabID);
        if (idx === -1) return;

        rememberClosedTab(state.tabs[idx]);
        await animateTabClose(tabID);
        idx = state.tabs.findIndex(tab => tab.id === tabID);
        if (idx === -1) {
            return;
        }
        state.tabs.splice(idx, 1);
        syncEditorStateToBackend();

        if (state.tabs.length === 0) {
            const freshTab = createTab({ path: HOME_SCREEN_PATH, title: 'Start' });
            state.tabs.push(freshTab);
            await activateTab(freshTab, { preserveCurrent: false });
            return;
        }

        if (state.activeTabId === tabID) {
            const fallback = state.tabs[Math.max(0, idx - 1)] || state.tabs[0];
            await activateTab(fallback, { preserveCurrent: false });
            return;
        }

        renderTabs();
    } finally {
        pendingCloseTabIds.delete(tabID);
        closingTabIds.delete(tabID);
    }
}

function rememberClosedTab(tab) {
    if (!tab?.path) {
        return;
    }

    closedTabs.unshift({
        path: tab.path,
        title: tab.title || 'Untitled',
    });

    if (closedTabs.length > MAX_CLOSED_TABS) {
        closedTabs.length = MAX_CLOSED_TABS;
    }
}

function pathMatchesDeletedPath(candidate, deletedPath, isDirectory = false) {
    if (!candidate || !deletedPath || candidate === HOME_SCREEN_PATH) {
        return false;
    }
    if (candidate === deletedPath) {
        return true;
    }
    if (!isDirectory) {
        return false;
    }
    const normalizedDeletedPath = deletedPath.replace(/[\\/]+$/, "");
    return candidate.startsWith(`${normalizedDeletedPath}/`) || candidate.startsWith(`${normalizedDeletedPath}\\`);
}

function tabMatchesDeletedPath(tab, deletedPath, isDirectory = false) {
    if (!tab) {
        return false;
    }
    return [
        tab.path,
        tab.editingSourcePath,
        tab.editingPreviewPath,
    ].some(path => pathMatchesDeletedPath(path, deletedPath, isDirectory));
}

function removeClosedTabsForDeletedPath(deletedPath, isDirectory = false) {
    for (let index = closedTabs.length - 1; index >= 0; index -= 1) {
        if (pathMatchesDeletedPath(closedTabs[index]?.path, deletedPath, isDirectory)) {
            closedTabs.splice(index, 1);
        }
    }
}

export async function discardTabsForDeletedPath(deletedPath, { isDirectory = false } = {}) {
    removeClosedTabsForDeletedPath(deletedPath, isDirectory);

    const deletedTabIds = new Set(
        state.tabs
            .filter(tab => tabMatchesDeletedPath(tab, deletedPath, isDirectory))
            .map(tab => tab.id)
    );
    if (deletedTabIds.size === 0) {
        return;
    }

    const wasActiveDeleted = deletedTabIds.has(state.activeTabId);
    state.tabs = state.tabs.filter(tab => !deletedTabIds.has(tab.id));
    syncEditorStateToBackend();
    deletedTabIds.forEach(tabId => closingTabIds.delete(tabId));

    if (state.tabs.length === 0) {
        const freshTab = createTab({ path: HOME_SCREEN_PATH, title: 'Start' });
        state.tabs.push(freshTab);
        await activateTab(freshTab, { preserveCurrent: false });
        return;
    }

    if (wasActiveDeleted || !state.tabs.some(tab => tab.id === state.activeTabId)) {
        const fallback = state.tabs[0];
        await activateTab(fallback, { preserveCurrent: false });
        return;
    }

    renderTabs();
}

export async function reopenClosedTab() {
    const closedTab = closedTabs.shift();
    if (!closedTab) {
        showToast('No closed tab to reopen.', 'history');
        return;
    }

    await openPath(closedTab.path, {
        pushHistory: true,
        setHome: true,
        newTab: true,
    });
}

function animateTabClose(tabID) {
    cancelPointerDrag();
    closingTabIds.add(tabID);
    return Promise.all([
        desktopTabView?.remove(tabID),
        mobileTabView?.remove(tabID),
    ]);
}

// ── New Tab ────────────────────────────────────────────────

export async function createAndSwitchToNewTab(path = HOME_SCREEN_PATH, options = {}) {
    const tab = createTab({
        path,
        title: path === HOME_SCREEN_PATH ? 'Start' : (options.title || basename(path) || 'Untitled'),
    });
    state.tabs.push(tab);
    activateTab(tab, { renderDocument: false });
    await openPath(path, { ...options, pushHistory: false, tabId: tab.id });
}

export async function createUnsavedMarkdownTab() {
    const tab = createTab({ path: MOBILE_UNTITLED_PATH, title: 'Untitled' });
    tab.currentMarkdownSource = '';
    tab.isEditing = true;
    tab.editorOriginalContent = '';
    tab.editingSourcePath = MOBILE_UNTITLED_PATH;
    tab.editingSourceFolder = '';
    tab.editingPreviewPath = MOBILE_UNTITLED_PATH;
    tab.editingPreviewFolder = '';
    tab.homeTargetPath = HOME_SCREEN_PATH;

    state.tabs.push(tab);
    await activateTab(tab);
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
