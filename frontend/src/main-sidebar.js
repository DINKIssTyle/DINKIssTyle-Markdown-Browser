/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import {
    state, el, HOME_SCREEN_PATH,
    getPathDirname, documentTypeFromPath, basename,
    escapeHTML, escapeAttr, isBundledDocumentPath, getScroller,
    isSupportedPreviewPath, isImagePath,
} from './main-state.js';
import { handleSearch, updateSearchClearButton, handleSearchInputKeydown, clearSearchInput } from './main-ui.js';
import { debounce } from './main-state.js';
import { showTextPrompt } from './main-dialogs.js';
import {
    scrollEditorToLine,
    getCurrentEditorText,
    insertFileLink,
    focusEditor,
    applyEditedDocumentRename,
    hasUnsavedEditorChanges,
    isEditingDocumentPath,
    saveCurrentDocument,
} from './main-editor.js';
import { AskConfirm, DeleteFileTreePath, DuplicateFileTreePath, ListFileTree, GetRelativePath, RenameFileTreePath, GetDefaultStorageDirectory } from '../bindings/dinkisstyle-markdown-browser/internal/app/app';
import { LogError } from './wails-runtime';
import { isMobilePlatform } from './platform-common.js';
import { triggerHaptic } from './main-haptic.js';
import { updateCustomVerticalScrollbars } from './main-settings.js';

// ... (omitted lines)

import { marked } from 'marked';

let currentOutlineDocPath = '';
const outlineCollapsedKeys = new Set();

function formatOutlineText(text) {
    if (!text) return '';
    try {
        if (typeof marked !== 'undefined' && marked.parseInline) {
            return marked.parseInline(text.trim());
        }
    } catch (_) {}
    return escapeHTML(text);
}

export function updateOutline() {
    if (!el.markdownOutline) return;

    if (state.currentDocumentType !== 'markdown') {
        el.markdownOutline.innerHTML = '<div class="sidebar-hint">Open a Markdown file to view outline.</div>';
        return;
    }

    if (state.currentDocumentPath !== currentOutlineDocPath) {
        currentOutlineDocPath = state.currentDocumentPath;
        outlineCollapsedKeys.clear();
    }

    let headings = [];
    if (state.isEditing) {
        const text = getCurrentEditorText();
        const lines = (text || '').split(/\r?\n/);
        lines.forEach((lineText, idx) => {
            const match = lineText.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                headings.push({
                    level: match[1].length,
                    text: match[2].trim(),
                    line: idx + 1,
                    el: null
                });
            }
        });
    } else {
        const container = el.markdownContainer;
        const nodes = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        headings = nodes.map(h => ({
            level: parseInt(h.tagName.substring(1)),
            text: h.innerText || h.textContent,
            line: parseInt(h.getAttribute('data-dkst-live-line-start')) || 1,
            el: h
        }));
    }

    if (headings.length === 0) {
        el.markdownOutline.innerHTML = '<div class="sidebar-hint">No headings found in this document.</div>';
        return;
    }

    // Calculate hierarchy and children
    const headingMeta = headings.map((h, index) => {
        let childCount = 0;
        const childrenIndices = [];
        for (let j = index + 1; j < headings.length; j++) {
            if (headings[j].level > h.level) {
                childCount++;
                childrenIndices.push(j);
            } else {
                break;
            }
        }
        const hasChildren = childCount > 0;
        const key = `${h.level}:${h.text}:${index}`;
        const isCollapsed = outlineCollapsedKeys.has(key);
        return {
            hasChildren,
            childCount,
            childrenIndices,
            key,
            isCollapsed
        };
    });

    // Determine which items should be hidden because an ancestor is collapsed
    const hiddenIndices = new Set();
    headingMeta.forEach((meta) => {
        if (meta.isCollapsed && meta.hasChildren) {
            meta.childrenIndices.forEach(childIdx => hiddenIndices.add(childIdx));
        }
    });

    el.markdownOutline.classList.add('is-heading-formatted');
    el.markdownOutline.innerHTML = headings.map((h, index) => {
        const meta = headingMeta[index];
        const isHidden = hiddenIndices.has(index);
        const topButton = index === 0 ? `
                <button class="outline-top-btn" type="button" tabindex="-1" title="Top of document" aria-label="Top of document">
                    <span class="material-symbols-outlined" aria-hidden="true">vertical_align_top</span>
                </button>
            ` : '';

        let collapseBtn = '';
        if (meta.hasChildren) {
            if (meta.isCollapsed) {
                // Collapsed: always display collapse indicator on the right of the label
                collapseBtn = `
                    <button class="outline-collapse-btn is-collapsed-indicator" type="button" tabindex="-1" title="Expand section (${meta.childCount} hidden ${meta.childCount === 1 ? 'item' : 'items'})" aria-label="Expand section" data-key="${escapeAttr(meta.key)}">
                        <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
                    </button>
                `;
            } else {
                // Expanded: no indicator by default, visible on hover
                collapseBtn = `
                    <button class="outline-collapse-btn" type="button" tabindex="-1" title="Collapse section" aria-label="Collapse section" data-key="${escapeAttr(meta.key)}">
                        <span class="material-symbols-outlined" aria-hidden="true">expand_less</span>
                    </button>
                `;
            }
        }

        const formattedText = formatOutlineText(h.text);
        const itemClasses = [
            'outline-item',
            `level-${h.level}`,
            meta.hasChildren ? 'has-children' : '',
            meta.isCollapsed ? 'is-collapsed' : '',
            isHidden ? 'is-outline-hidden' : '',
            (topButton || collapseBtn) ? 'has-actions' : ''
        ].filter(Boolean).join(' ');

        return `
            <div class="${itemClasses}" data-index="${index}" data-line="${h.line}" data-key="${escapeAttr(meta.key)}" tabindex="${isHidden ? -1 : 0}">
                <span class="outline-text">${formattedText}</span>
                <div class="outline-item-actions">
                    ${collapseBtn}
                    ${topButton}
                </div>
            </div>
        `;
    }).join('');

    el.markdownOutline.querySelectorAll('.outline-collapse-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const key = button.getAttribute('data-key');
            if (key) {
                if (outlineCollapsedKeys.has(key)) {
                    outlineCollapsedKeys.delete(key);
                } else {
                    outlineCollapsedKeys.add(key);
                }
                updateOutline();
            }
        });
    });

    el.markdownOutline.querySelectorAll('.outline-top-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
            setTimeout(() => {
                getScroller().scrollTo({ top: 0, behavior: 'smooth' });
                if (state.isEditing) {
                    scrollEditorToLine(1);
                }
            }, 60);
        });
    });

    el.markdownOutline.querySelectorAll('.outline-item').forEach(item => {
        const index = parseInt(item.dataset.index);
        const meta = headingMeta[index];

        item.onclick = (event) => {
            // Ignore if clicked on an action button inside
            if (event.target.closest('.outline-collapse-btn, .outline-top-btn')) {
                return;
            }

            const headingObj = headings[index];

            if (window.innerWidth <= 768) {
                closeSidebar();
            }

            setTimeout(() => {
                if (state.isEditing) {
                    const line = headingObj?.line || parseInt(item.dataset.line) || 1;
                    scrollEditorToLine(line);
                } else if (headingObj?.el) {
                    scrollPreviewHeadingToTop(headingObj.el);
                }
            }, 60);
        };

        item.addEventListener('keydown', (event) => {
            if (!meta) return;
            if (event.key === 'ArrowLeft' && meta.hasChildren && !meta.isCollapsed) {
                event.preventDefault();
                event.stopPropagation();
                outlineCollapsedKeys.add(meta.key);
                updateOutline();
                const newItem = el.markdownOutline.querySelector(`.outline-item[data-index="${index}"]`);
                if (newItem) newItem.focus();
            } else if (event.key === 'ArrowRight' && meta.hasChildren && meta.isCollapsed) {
                event.preventDefault();
                event.stopPropagation();
                outlineCollapsedKeys.delete(meta.key);
                updateOutline();
                const newItem = el.markdownOutline.querySelector(`.outline-item[data-index="${index}"]`);
                if (newItem) newItem.focus();
            }
        });
    });
    bindListKeyboardNavigation(el.markdownOutline, '.outline-item:not(.is-outline-hidden)');
}

function scrollPreviewHeadingToTop(heading) {
    if (!heading) return;
    try {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (_) {
        const scroller = getScroller();
        if (scroller && heading) {
            const scrollerRect = scroller.getBoundingClientRect();
            const headingRect = heading.getBoundingClientRect();
            const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            const targetTop = scroller.scrollTop + (headingRect.top - scrollerRect.top);
            scroller.scrollTo({
                top: Math.min(maxScrollTop, Math.max(0, targetTop)),
                behavior: 'smooth',
            });
        }
    }
}
import { copyTextToClipboard, showToast } from './main-ui.js';
import { persistAppSettings } from './main-settings.js';

let isSidebarOpen = false;
let activeSidebarTab = 'files';
const expandedFileTreePaths = new Set();
const loadingFileTreePaths = new Set();
let fileTreeRootPath = "";
let fileTreeRootNode = null;
let fileTreeContextMenu = null;

export function initSidebar() {
    if (!el.btnSidebarToggle) return;

    el.btnSidebarToggle.onclick = toggleSidebar;

    bindSidebarTabButton(el.sidebarTabFiles, 'files');
    bindSidebarTabButton(el.sidebarTabOutline, 'outline');
    bindSidebarTabButton(el.sidebarTabSearch, 'search');

    // Bind search events in sidebar
    if (el.searchInput) {
        el.searchInput.addEventListener('input', debounce(handleSearch, 300));
        el.searchInput.addEventListener('input', updateSearchClearButton);
        el.searchInput.addEventListener('keydown', handleSearchInputKeydown);
    }
    if (el.btnClearSearch) {
        const handleClearClick = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            clearSearchInput(e);
        };
        el.btnClearSearch.addEventListener('pointerdown', handleClearClick);
        el.btnClearSearch.addEventListener('click', handleClearClick);
    }
    if (el.searchOpenTabFolders) {
        el.searchOpenTabFolders.addEventListener('change', () => handleSearch());
    }

    // Initial state
    updateSidebarUI();
    syncSidebarOffset();

    // Bind resizer
    if (el.sidebarResizer) {
        bindResizer();
    }

    // Bind global click to close context menu
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.file-tree-context-menu, .file-tree-more-btn')) {
            closeFileTreeContextMenu();
        }
    });
    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.file-tree-context-menu, .file-tree-more-btn')) {
            closeFileTreeContextMenu();
        }
    });
    window.addEventListener('blur', () => closeFileTreeContextMenu());
}

function bindSidebarTabButton(button, tabId) {
    if (!button) return;

    button.onclick = () => switchSidebarTab(tabId);
    button.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab' || event.shiftKey || activeSidebarTab !== tabId) {
            return;
        }

        event.preventDefault();
        focusSidebarPanel(tabId);
    });
}

function bindResizer() {
    let isResizing = false;
    let pendingWidth = 0;
    let resizeFrame = 0;

    const applyPendingWidth = () => {
        resizeFrame = 0;
        if (!isResizing || !pendingWidth) return;
        document.documentElement.style.setProperty('--sidebar-width', `${pendingWidth}px`);
    };

    el.sidebarResizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.classList.add('sidebar-is-resizing');
        el.sidebarResizer.classList.add('is-resizing');
        e.preventDefault();

        const onMouseMove = (moveEvent) => {
            if (!isResizing) return;

            let newWidth = moveEvent.clientX;
            if (newWidth < 200) newWidth = 200;
            if (newWidth > 600) newWidth = 600;

            pendingWidth = newWidth;
            if (!resizeFrame) {
                resizeFrame = requestAnimationFrame(applyPendingWidth);
            }
        };

        const onMouseUp = () => {
            isResizing = false;
            if (resizeFrame) {
                cancelAnimationFrame(resizeFrame);
                resizeFrame = 0;
            }
            if (pendingWidth) {
                document.documentElement.style.setProperty('--sidebar-width', `${pendingWidth}px`);
            }
            pendingWidth = 0;
            document.body.style.cursor = '';
            document.body.classList.remove('sidebar-is-resizing');
            el.sidebarResizer.classList.remove('is-resizing');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

let sidebarTransitionTimer = null;

export function notifySidebarTransition() {
    document.documentElement.classList.add('is-sidebar-transitioning');
    if (el.contentViewScrollbar) {
        el.contentViewScrollbar.classList.remove('is-overflowing', 'is-active');
    }
    if (el.editorViewScrollbar) {
        el.editorViewScrollbar.classList.remove('is-overflowing', 'is-active');
    }

    if (sidebarTransitionTimer) {
        clearTimeout(sidebarTransitionTimer);
    }

    sidebarTransitionTimer = setTimeout(() => {
        document.documentElement.classList.remove('is-sidebar-transitioning');
        sidebarTransitionTimer = null;
        updateCustomVerticalScrollbars();
    }, 300);
}

export function closeSidebar() {
    isSidebarOpen = false;
    notifySidebarTransition();
    updateSidebarUI();
    el.appSidebar.classList.add('hidden');
    el.btnSidebarToggle.classList.remove('active');
    syncSidebarOffset();
    focusDocumentSurface();
}

export function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
    notifySidebarTransition();
    el.appSidebar.classList.toggle('hidden', !isSidebarOpen);
    el.btnSidebarToggle.classList.toggle('active', isSidebarOpen);
    syncSidebarOffset();
    
    if (isSidebarOpen) {
        refreshSidebarContent();
    } else {
        focusDocumentSurface();
    }
}

export function toggleSidebarTab(tabId, options = {}) {
    const shouldClose = isSidebarOpen && activeSidebarTab === tabId;
    activeSidebarTab = tabId;
    isSidebarOpen = !shouldClose;
    notifySidebarTransition();
    updateSidebarUI();
    el.appSidebar.classList.toggle('hidden', !isSidebarOpen);
    el.btnSidebarToggle.classList.toggle('active', isSidebarOpen);
    syncSidebarOffset();

    if (isSidebarOpen) {
        refreshSidebarContent();
        if (options.focusSearchInput && tabId === 'search') {
            focusSearchInput();
        } else if (options.focusTab) {
            focusSidebarTab(tabId);
        }
    } else {
        focusDocumentSurface();
    }
}

export function openSidebarTab(tabId) {
    activeSidebarTab = tabId;
    isSidebarOpen = true;
    notifySidebarTransition();
    updateSidebarUI();
    el.appSidebar.classList.remove('hidden');
    el.btnSidebarToggle.classList.add('active');
    syncSidebarOffset();
    refreshSidebarContent();
}

function focusSearchInput() {
    requestAnimationFrame(() => {
        el.searchInput?.focus();
        el.searchInput?.select();
    });
}

function focusDocumentSurface() {
    requestAnimationFrame(() => {
        if (state.isEditing) {
            focusEditor();
            return;
        }

        const focusTarget = el.contentView || el.markdownContainer;
        if (!focusTarget) return;
        if (!focusTarget.hasAttribute('tabindex')) {
            focusTarget.tabIndex = -1;
        }
        focusTarget.focus({ preventScroll: true });
    });
}

function syncSidebarOffset() {
    document.documentElement.style.setProperty(
        '--active-sidebar-offset',
        isSidebarOpen ? 'var(--sidebar-width)' : '0px'
    );
}

export function switchSidebarTab(tabId) {
    activeSidebarTab = tabId;
    updateSidebarUI();
    refreshSidebarContent();
}

function updateSidebarUI() {
    const tabs = {
        'files': { btn: el.sidebarTabFiles, panel: el.sidebarPanelFiles },
        'outline': { btn: el.sidebarTabOutline, panel: el.sidebarPanelOutline },
        'search': { btn: el.sidebarTabSearch, panel: el.sidebarPanelSearch }
    };

    Object.keys(tabs).forEach(id => {
        const active = (id === activeSidebarTab);
        tabs[id].btn.classList.toggle('active', active);
        tabs[id].panel.classList.toggle('hidden', !active);
    });
}

function focusSidebarTab(tabId) {
    const tabs = {
        'files': el.sidebarTabFiles,
        'outline': el.sidebarTabOutline,
        'search': el.sidebarTabSearch
    };

    requestAnimationFrame(() => tabs[tabId]?.focus());
}

function focusSidebarPanel(tabId) {
    const panels = {
        'files': el.sidebarPanelFiles,
        'outline': el.sidebarPanelOutline,
        'search': el.sidebarPanelSearch
    };
    const panel = panels[tabId];
    if (!panel) return;

    const focusable = panel.querySelector('.file-tree-item, .outline-item, .result-item')
        || panel.querySelector('button:not([disabled]):not(.hidden), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
    if (focusable) {
        focusable.focus();
        return;
    }

    panel.tabIndex = -1;
    panel.focus();
}

export function refreshSidebarContent() {
    if (!isSidebarOpen) return;

    if (activeSidebarTab === 'outline') {
        updateOutline();
    } else if (activeSidebarTab === 'files') {
        updateFileTree();
    }
}



export async function updateFileTree(options = {}) {
    if (!el.fileTree) return;

    const forceRefresh = !!options.forceRefresh;
    const rootPath = await getFileTreeRootPath();
    if (!rootPath) {
        el.fileTree.innerHTML = renderFileTreeHint();
        return;
    }

    expandedFileTreePaths.add(rootPath);
    if (!forceRefresh && rootPath === fileTreeRootPath && fileTreeRootNode) {
        el.fileTree.innerHTML = renderFileTree(fileTreeRootNode, 0, true);
        bindFileTreeEvents();
        return;
    }

    fileTreeRootPath = rootPath;
    fileTreeRootNode = null;
    loadingFileTreePaths.clear();
    el.fileTree.innerHTML = '<div class="sidebar-hint">Loading files...</div>';

    try {
        fileTreeRootNode = await ListFileTree(rootPath);
        el.fileTree.innerHTML = renderFileTree(fileTreeRootNode, 0, true);
        bindFileTreeEvents();
    } catch (error) {
        console.error('updateFileTree failed:', error);
        LogError(`updateFileTree failed root=${rootPath}: ${error?.message || error}`);
        el.fileTree.innerHTML = '<div class="sidebar-hint">Failed to load file tree.</div>';
    }
}

async function getFileTreeRootPath() {
    if (isMobilePlatform()) {
        try {
            const defaultDir = await GetDefaultStorageDirectory();
            if (defaultDir) {
                return defaultDir;
            }
        } catch (error) {
            console.warn("GetDefaultStorageDirectory failed:", error);
        }
    }

    if (state.currentFolder) {
        return state.currentFolder;
    }
    if (state.currentFilePath && state.currentFilePath !== HOME_SCREEN_PATH && !isBundledDocumentPath(state.currentFilePath)) {
        return getPathDirname(state.currentFilePath) || state.currentFilePath;
    }
    if (state.homeTargetPath && state.homeTargetPath !== HOME_SCREEN_PATH && !isBundledDocumentPath(state.homeTargetPath)) {
        return getPathDirname(state.homeTargetPath) || state.homeTargetPath;
    }

    try {
        const defaultDir = await GetDefaultStorageDirectory();
        if (defaultDir) {
            return defaultDir;
        }
    } catch (error) {
        console.warn("GetDefaultStorageDirectory failed:", error);
    }

    return "";
}

function renderFileTreeHint() {
    return `
        <div class="sidebar-hint file-tree-empty-hint">
            <span class="material-symbols-outlined" aria-hidden="true">folder_limited</span>
            <span>Open a folder or file to view tree.</span>
        </div>
    `;
}

function renderFileTree(node, depth, isRoot = false) {
    if (!node) return "";

    const isDir = !!node.isDir;
    const isExpanded = isRoot || expandedFileTreePaths.has(node.path);
    const hasLoadedChildren = isDir && Array.isArray(node.children) && node.children.length > 0;
    const canExpand = isDir && (hasLoadedChildren || node.hasItems);
    const icon = isDir ? (isExpanded ? 'folder_open' : 'folder') : iconForFile(node.name);
    const current = !isDir && node.path === state.currentFilePath;
    const isLoading = loadingFileTreePaths.has(node.path);
    const filterButton = isRoot ? `
            <button class="file-tree-filter-btn ${state.fileTreeFilterEnabled ? 'active' : ''}" id="btn-file-tree-filter" type="button" 
                title="${state.fileTreeFilterEnabled ? 'Show all files' : 'Show readable files only'}" 
                aria-label="Filter readable files">
                <span class="material-symbols-outlined" aria-hidden="true">${state.fileTreeFilterEnabled ? 'filter_list_off' : 'filter_list'}</span>
            </button>
        ` : '';
    const refreshButton = isRoot ? `
            <button class="file-tree-refresh-btn" type="button" title="Refresh file tree" aria-label="Refresh file tree">
                <span class="material-symbols-outlined" aria-hidden="true">cached</span>
            </button>
        ` : '';

    const moreButton = !isRoot ? `
            <button class="file-tree-more-btn" type="button" title="More options" aria-label="More options">
                <span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
            </button>
        ` : '';

    const row = `
        <div class="file-tree-item ${isDir ? 'is-dir' : 'is-file'} ${isRoot ? 'is-root has-refresh' : ''} ${current ? 'active' : ''}"
            data-path="${escapeAttr(node.path)}"
            data-kind="${isDir ? 'dir' : 'file'}"
            style="--tree-depth: ${depth};"
            tabindex="0"
            title="${escapeAttr(node.path)}">
            <span class="file-tree-toggle material-symbols-outlined" aria-hidden="true">${canExpand ? (isExpanded ? 'expand_more' : 'chevron_right') : ''}</span>
            <span class="file-tree-icon material-symbols-outlined" aria-hidden="true">${icon}</span>
            <span class="file-tree-name">${escapeHTML(node.name || basename(node.path))}</span>
            ${filterButton}
            ${refreshButton}
            ${moreButton}
        </div>
    `;

    if (!canExpand || !isExpanded) {
        return row;
    }

    if (isLoading && !hasLoadedChildren) {
        return row + `<div class="file-tree-loading" style="--tree-depth: ${depth + 1};">Loading...</div>`;
    }

    return row + (node.children || [])
        .filter(child => {
            if (!state.fileTreeFilterEnabled) return true;
            if (child.isDir) return true; // Always show directories
            return isSupportedPreviewPath(child.path);
        })
        .map(child => renderFileTree(child, depth + 1))
        .join('');
}

function bindFileTreeEvents() {
    el.fileTree.querySelectorAll('.file-tree-refresh-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await updateFileTree({ forceRefresh: true });
        });
    });

    el.fileTree.querySelectorAll('.file-tree-filter-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            state.fileTreeFilterEnabled = !state.fileTreeFilterEnabled;
            updateFileTree();
            persistAppSettings();
        });
    });

    el.fileTree.querySelectorAll('.file-tree-item').forEach(item => {
        let longPressTimer = null;
        let touchStartX = 0;
        let touchStartY = 0;
        let isLongPressTriggered = false;

        const clearLongPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        const moreBtn = item.querySelector('.file-tree-more-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const path = item.dataset.path;
                const kind = item.dataset.kind;
                if (!path) return;
                showFileTreeContextMenu(event, path, kind === 'dir');
            });
        }

        item.addEventListener('touchstart', (event) => {
            if (event.target.closest('.file-tree-more-btn, .file-tree-refresh-btn, .file-tree-filter-btn')) return;
            const touch = event.touches?.[0];
            if (!touch) return;
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            isLongPressTriggered = false;

            clearLongPress();
            longPressTimer = setTimeout(() => {
                isLongPressTriggered = true;
                triggerHaptic('medium');
                const path = item.dataset.path;
                const kind = item.dataset.kind;
                if (path) {
                    showFileTreeContextMenu(touch, path, kind === 'dir');
                }
            }, 450);
        }, { passive: true });

        item.addEventListener('touchmove', (event) => {
            const touch = event.touches?.[0];
            if (!touch) return;
            const moveDist = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);
            if (moveDist > 10) {
                clearLongPress();
            }
        }, { passive: true });

        item.addEventListener('touchend', (event) => {
            clearLongPress();
            if (isLongPressTriggered) {
                event.preventDefault();
                event.stopPropagation();
            }
        });

        item.addEventListener('touchcancel', () => {
            clearLongPress();
        });

        item.addEventListener('click', async (event) => {
            if (isLongPressTriggered) {
                isLongPressTriggered = false;
                return;
            }
            if (event.target.closest('.file-tree-refresh-btn, .file-tree-filter-btn, .file-tree-more-btn')) return;
            const path = item.dataset.path;
            if (!path) return;

            if (item.dataset.kind === 'dir') {
                if (expandedFileTreePaths.has(path)) {
                    expandedFileTreePaths.delete(path);
                } else {
                    expandedFileTreePaths.add(path);
                    await ensureDirectoryChildrenLoaded(path);
                }
                updateFileTree();
                return;
            }

            const { openPath } = await import('./main-navigation.js');
            const wantsNewTab = event.shiftKey || event.metaKey || event.ctrlKey;
            const editingTabId = findEditingTabIdForPath(path);
            if (editingTabId && !wantsNewTab) {
                const { switchToTab } = await import('./main-tabs.js');
                await switchToTab(editingTabId);
                if (window.innerWidth <= 768 && document.documentElement.classList.contains('platform-mobile')) {
                    closeSidebar();
                }
                return;
            }

            await openPath(path, {
                pushHistory: true,
                setHome: false,
                newTab: wantsNewTab || state.isEditing,
                openInEditMode: state.isEditing && documentTypeFromPath(path) === 'markdown',
            });
            if (window.innerWidth <= 768 && document.documentElement.classList.contains('platform-mobile')) {
                closeSidebar();
            }
        });

        item.addEventListener('contextmenu', (event) => {
            const path = item.dataset.path;
            const kind = item.dataset.kind;
            if (!path) return;

            event.preventDefault();
            event.stopPropagation();
            showFileTreeContextMenu(event, path, kind === 'dir');
        });
    });
    bindListKeyboardNavigation(el.fileTree, '.file-tree-item');
}

function findEditingTabIdForPath(path) {
    if (!path) {
        return "";
    }

    if (state.isEditing) {
        const activeEditingPath = state.editingSourcePath || state.currentFilePath || "";
        if (activeEditingPath === path) {
            return state.activeTabId;
        }
    }

    const tab = state.tabs.find(item => {
        if (!item?.isEditing) {
            return false;
        }
        const editingPath = item.editingSourcePath || item.path || "";
        return editingPath === path;
    });

    return tab?.id || "";
}

function bindListKeyboardNavigation(container, itemSelector) {
    if (!container) return;

    container.querySelectorAll(itemSelector).forEach(item => {
        item.addEventListener('keydown', (event) => {
            const items = Array.from(container.querySelectorAll(itemSelector));
            const index = items.indexOf(event.currentTarget);
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
                event.currentTarget.click();
            }
        });
    });
}

function showFileTreeContextMenu(event, path, isDir) {
    if (!fileTreeContextMenu) {
        fileTreeContextMenu = document.createElement('div');
        fileTreeContextMenu.className = 'context-menu file-tree-context-menu hidden';
        fileTreeContextMenu.setAttribute('aria-hidden', 'true');
        fileTreeContextMenu.setAttribute('role', 'menu');
        document.body.appendChild(fileTreeContextMenu);
    }

    const isImage = isImagePath(path);

    fileTreeContextMenu.innerHTML = `
        ${!isDir ? `<button class="context-menu-item" id="ft-ctx-open-new-tab">Open In New Tab</button>` : ''}
        ${state.isEditing && !isDir ? `<button class="context-menu-item" id="ft-ctx-insert">Insert</button>` : ''}
        <button class="context-menu-item" id="ft-ctx-rename">Rename</button>
        <button class="context-menu-item" id="ft-ctx-duplicate">Duplicate</button>
        <button class="context-menu-item" id="ft-ctx-delete">Delete</button>
        <button class="context-menu-item" id="ft-ctx-copy-path">Copy Path</button>
    `;

    const openNewTabBtn = fileTreeContextMenu.querySelector('#ft-ctx-open-new-tab');
    if (openNewTabBtn) {
        openNewTabBtn.onclick = async () => {
            closeFileTreeContextMenu();
            const { openPath } = await import('./main-navigation.js');
            await openPath(path, {
                pushHistory: true,
                setHome: false,
                newTab: true,
            });
        };
    }

    const insertBtn = fileTreeContextMenu.querySelector('#ft-ctx-insert');
    if (insertBtn) {
        insertBtn.onclick = () => {
            insertFileLink(path, isImage);
            closeFileTreeContextMenu();
        };
    }

    const copyBtn = fileTreeContextMenu.querySelector('#ft-ctx-copy-path');
    if (copyBtn) {
        copyBtn.onclick = async () => {
            let copyText = path;
            try {
                const base = state.editingSourcePath || state.currentFilePath || "";
                const rel = await GetRelativePath(base, path);
                if (rel) {
                    copyText = rel;
                }
            } catch (error) {
                console.error("Failed to get relative path for copy:", error);
            }
            await copyTextToClipboard(copyText);
            showToast('Relative path copied to clipboard.', 'content_copy');
            closeFileTreeContextMenu();
        };
    }

    const renameBtn = fileTreeContextMenu.querySelector('#ft-ctx-rename');
    if (renameBtn) {
        renameBtn.onclick = async () => {
            closeFileTreeContextMenu();
            const currentName = basename(path);
            const newName = await showFileTreeNamePrompt("Rename", `Rename this ${isDir ? 'folder' : 'file'}:`, currentName);
            if (newName === null) return;
            const trimmedName = newName.trim();
            if (!trimmedName || trimmedName === currentName) return;

            const ok = await AskConfirm(
                "Rename",
                `Rename ${currentName} to ${trimmedName}?`,
                "Rename",
                "Cancel",
            );
            if (!ok) return;

            try {
                const isCurrentEditedFile = !isDir && isEditingDocumentPath(path);
                if (isCurrentEditedFile && hasUnsavedEditorChanges()) {
                    const saveBeforeRename = await AskConfirm(
                        "Save Before Rename",
                        `Save changes to ${currentName} before renaming it?`,
                        "Save",
                        "Cancel",
                    );
                    if (!saveBeforeRename) return;
                    const saved = await saveCurrentDocument({ confirm: false, exitAfterSave: false });
                    if (!saved) return;
                }

                const renamedPath = await RenameFileTreePath(path, trimmedName);
                if (!isDir) {
                    applyEditedDocumentRename(path, renamedPath);
                }
                await updateFileTree({ forceRefresh: true });
                showToast(`${isDir ? 'Folder' : 'File'} renamed.`, 'drive_file_rename_outline');
            } catch (error) {
                LogError(`RenameFileTreePath failed path=${path}: ${error?.message || error}`);
                showToast(error?.message || `Failed to rename ${isDir ? 'folder' : 'file'}.`, 'error');
            }
        };
    }

    const duplicateBtn = fileTreeContextMenu.querySelector('#ft-ctx-duplicate');
    if (duplicateBtn) {
        duplicateBtn.onclick = async () => {
            closeFileTreeContextMenu();
            const ok = await AskConfirm(
                "Duplicate",
                `Duplicate this ${isDir ? 'folder' : 'file'}?\n\n${basename(path)}`,
                "Duplicate",
                "Cancel",
            );
            if (!ok) return;
            try {
                await DuplicateFileTreePath(path);
                await updateFileTree({ forceRefresh: true });
                showToast(`${isDir ? 'Folder' : 'File'} duplicated.`, 'content_copy');
            } catch (error) {
                LogError(`DuplicateFileTreePath failed path=${path}: ${error?.message || error}`);
                showToast(`Failed to duplicate ${isDir ? 'folder' : 'file'}.`, 'error');
            }
        };
    }

    const deleteBtn = fileTreeContextMenu.querySelector('#ft-ctx-delete');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            closeFileTreeContextMenu();
            const ok = await AskConfirm(
                "Delete",
                `Delete this ${isDir ? 'folder' : 'file'}?\n\n${basename(path)}\n\nThis cannot be undone.`,
                "Delete",
                "Cancel",
            );
            if (!ok) return;
            try {
                await DeleteFileTreePath(path);
                const { discardTabsForDeletedPath } = await import('./main-tabs.js');
                await discardTabsForDeletedPath(path, { isDirectory: isDir });
                await updateFileTree({ forceRefresh: true });
                showToast(`${isDir ? 'Folder' : 'File'} deleted.`, 'delete');
            } catch (error) {
                LogError(`DeleteFileTreePath failed path=${path}: ${error?.message || error}`);
                showToast(`Failed to delete ${isDir ? 'folder' : 'file'}.`, 'error');
            }
        };
    }

    fileTreeContextMenu.classList.remove('show');
    fileTreeContextMenu.classList.remove('hidden');
    fileTreeContextMenu.setAttribute('aria-hidden', 'false');
    
    // Position menu at event coordinates
    const menuW = fileTreeContextMenu.offsetWidth || fileTreeContextMenu.getBoundingClientRect().width || 168;
    const menuH = fileTreeContextMenu.offsetHeight || fileTreeContextMenu.getBoundingClientRect().height || 160;

    let clientX = event?.clientX;
    let clientY = event?.clientY;

    if ((clientX === undefined || clientY === undefined) && event?.target) {
        const rect = event.target.getBoundingClientRect?.();
        if (rect) {
            clientX = rect.left;
            clientY = rect.bottom;
        }
    }

    const rawX = clientX !== undefined ? clientX : (window.innerWidth / 2 - menuW / 2);
    const rawY = clientY !== undefined ? clientY : (window.innerHeight / 2 - menuH / 2);
    const x = Math.max(10, Math.min(rawX, window.innerWidth - menuW - 10));
    const y = Math.max(10, Math.min(rawY, window.innerHeight - menuH - 10));
    
    fileTreeContextMenu.style.left = `${Math.round(x)}px`;
    fileTreeContextMenu.style.top = `${Math.round(y)}px`;
    requestAnimationFrame(() => fileTreeContextMenu?.classList.add('show'));
}

function closeFileTreeContextMenu() {
    if (fileTreeContextMenu) {
        fileTreeContextMenu.classList.remove('show');
        fileTreeContextMenu.classList.add('hidden');
        fileTreeContextMenu.setAttribute('aria-hidden', 'true');
    }
}

function showFileTreeNamePrompt(title, message, defaultValue = "") {
    return showTextPrompt(title, message, defaultValue, { select: true });
}

async function ensureDirectoryChildrenLoaded(path) {
    const node = findFileTreeNode(fileTreeRootNode, path);
    if (!node || !node.isDir || Array.isArray(node.children)) {
        return;
    }

    loadingFileTreePaths.add(path);
    el.fileTree.innerHTML = renderFileTree(fileTreeRootNode, 0, true);
    bindFileTreeEvents();

    try {
        const loaded = await ListFileTree(path);
        node.children = loaded.children || [];
        node.hasItems = loaded.hasItems;
    } catch (error) {
        LogError(`ensureDirectoryChildrenLoaded failed path=${path}: ${error?.message || error}`);
        node.children = [];
        node.hasItems = false;
    } finally {
        loadingFileTreePaths.delete(path);
    }
}

function findFileTreeNode(node, path) {
    if (!node) return null;
    if (node.path === path) return node;
    for (const child of node.children || []) {
        const found = findFileTreeNode(child, path);
        if (found) return found;
    }
    return null;
}

function iconForFile(path) {
    const lower = String(path || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(lower)) return 'image';
    if (/\.html?$/i.test(lower)) return 'html';
    if (/\.(md|markdown)$/i.test(lower)) return 'article';
    if (/\.txt$/i.test(lower)) return 'description';
    return 'draft';
}
