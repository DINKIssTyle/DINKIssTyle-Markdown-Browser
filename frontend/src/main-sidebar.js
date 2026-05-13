/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import {
    state, el, HOME_SCREEN_PATH,
    getPathDirname, documentTypeFromPath, basename,
    escapeHTML, escapeAttr, isBundledDocumentPath, getScroller,
} from './main-state.js';
import { handleSearch, updateSearchClearButton, handleSearchInputKeydown, clearSearchInput } from './main-ui.js';
import { debounce } from './main-state.js';
import { scrollEditorToLine } from './main-editor.js';
import { ListFileTree } from '../wailsjs/go/main/App';
import { LogError } from '../wailsjs/runtime/runtime';

let isSidebarOpen = false;
let activeSidebarTab = 'files';
const expandedFileTreePaths = new Set();
const loadingFileTreePaths = new Set();
let fileTreeRootPath = "";
let fileTreeRootNode = null;

export function initSidebar() {
    if (!el.btnSidebarToggle) return;

    el.btnSidebarToggle.onclick = toggleSidebar;

    if (el.sidebarTabFiles) el.sidebarTabFiles.onclick = () => switchSidebarTab('files');
    if (el.sidebarTabOutline) el.sidebarTabOutline.onclick = () => switchSidebarTab('outline');
    if (el.sidebarTabSearch) el.sidebarTabSearch.onclick = () => switchSidebarTab('search');

    // Bind search events in sidebar
    if (el.searchInput) {
        el.searchInput.addEventListener('input', debounce(handleSearch, 300));
        el.searchInput.addEventListener('input', updateSearchClearButton);
        el.searchInput.addEventListener('keydown', handleSearchInputKeydown);
    }
    if (el.btnClearSearch) {
        el.btnClearSearch.onclick = clearSearchInput;
    }
    if (el.searchOpenTabFolders) {
        el.searchOpenTabFolders.addEventListener('change', () => handleSearch());
    }

    // Initial state
    updateSidebarUI();

    // Bind resizer
    if (el.sidebarResizer) {
        bindResizer();
    }
}

function bindResizer() {
    let isResizing = false;

    el.sidebarResizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        el.sidebarResizer.classList.add('is-resizing');
        e.preventDefault();
        
        const onMouseMove = (moveEvent) => {
            if (!isResizing) return;
            
            let newWidth = moveEvent.clientX;
            if (newWidth < 200) newWidth = 200;
            if (newWidth > 600) newWidth = 600;
            
            document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        };

        const onMouseUp = () => {
            isResizing = false;
            document.body.style.cursor = '';
            el.sidebarResizer.classList.remove('is-resizing');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

export function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
    el.appSidebar.classList.toggle('hidden', !isSidebarOpen);
    el.btnSidebarToggle.classList.toggle('active', isSidebarOpen);
    
    if (isSidebarOpen) {
        refreshSidebarContent();
    }
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

export function refreshSidebarContent() {
    if (!isSidebarOpen) return;

    if (activeSidebarTab === 'outline') {
        updateOutline();
    } else if (activeSidebarTab === 'files') {
        updateFileTree();
    }
}

export function updateOutline() {
    if (!el.markdownOutline) return;

    const container = el.markdownContainer;
    if (state.currentDocumentType !== 'markdown' || container.classList.contains('hidden')) {
        el.markdownOutline.innerHTML = '<div class="sidebar-hint">Open a Markdown file to view outline.</div>';
        return;
    }

    const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length === 0) {
        el.markdownOutline.innerHTML = '<div class="sidebar-hint">No headings found in this document.</div>';
        return;
    }

    el.markdownOutline.innerHTML = headings.map((h, index) => {
        const level = parseInt(h.tagName.substring(1));
        const text = h.innerText || h.textContent;
        const topButton = index === 0 ? `
                <button class="outline-top-btn" type="button" title="Top of document" aria-label="Top of document">
                    <span class="material-symbols-outlined" aria-hidden="true">vertical_align_top</span>
                </button>
            ` : '';
        return `
            <div class="outline-item level-${level} ${index === 0 ? 'has-top-button' : ''}" data-index="${index}">
                <span class="outline-text">${escapeHTML(text)}</span>
                ${topButton}
            </div>
        `;
    }).join('');

    el.markdownOutline.querySelectorAll('.outline-top-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            getScroller().scrollTo({ top: 0, behavior: 'smooth' });
            if (state.isEditing) {
                scrollEditorToLine(1);
            }
        });
    });

    el.markdownOutline.querySelectorAll('.outline-item').forEach(item => {
        item.onclick = () => {
            const index = item.dataset.index;
            const heading = headings[index];
            scrollPreviewHeadingToTop(heading);

            // 에디터 상태면 에디터 스크롤도 이동
            if (state.isEditing) {
                const line = parseInt(heading.getAttribute('data-dkst-live-line-start'));
                if (!isNaN(line)) {
                    scrollEditorToLine(line);
                }
            }
        };
    });
}

function scrollPreviewHeadingToTop(heading) {
    const scroller = getScroller();
    if (!heading || !scroller) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const targetTop = scroller.scrollTop + (headingRect.top - scrollerRect.top);
    scroller.scrollTo({
        top: Math.min(maxScrollTop, Math.max(0, targetTop)),
        behavior: 'smooth',
    });
}

async function updateFileTree(options = {}) {
    if (!el.fileTree) return;

    const forceRefresh = !!options.forceRefresh;
    const rootPath = getFileTreeRootPath();
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

function getFileTreeRootPath() {
    if (state.currentFilePath === HOME_SCREEN_PATH) {
        return "";
    }
    if (state.homeTargetPath && state.homeTargetPath !== HOME_SCREEN_PATH && !isBundledDocumentPath(state.homeTargetPath)) {
        return getPathDirname(state.homeTargetPath) || state.homeTargetPath;
    }
    return state.currentFolder || "";
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
    const refreshButton = isRoot ? `
            <button class="file-tree-refresh-btn" type="button" title="Refresh file tree" aria-label="Refresh file tree">
                <span class="material-symbols-outlined" aria-hidden="true">cached</span>
            </button>
        ` : '';

    const row = `
        <div class="file-tree-item ${isDir ? 'is-dir' : 'is-file'} ${isRoot ? 'is-root has-refresh' : ''} ${current ? 'active' : ''}"
            data-path="${escapeAttr(node.path)}"
            data-kind="${isDir ? 'dir' : 'file'}"
            style="--tree-depth: ${depth};"
            title="${escapeAttr(node.path)}">
            <span class="file-tree-toggle material-symbols-outlined" aria-hidden="true">${canExpand ? (isExpanded ? 'expand_more' : 'chevron_right') : ''}</span>
            <span class="file-tree-icon material-symbols-outlined" aria-hidden="true">${icon}</span>
            <span class="file-tree-name">${escapeHTML(node.name || basename(node.path))}</span>
            ${refreshButton}
        </div>
    `;

    if (!canExpand || !isExpanded) {
        return row;
    }

    if (isLoading && !hasLoadedChildren) {
        return row + `<div class="file-tree-loading" style="--tree-depth: ${depth + 1};">Loading...</div>`;
    }

    return row + (node.children || []).map(child => renderFileTree(child, depth + 1)).join('');
}

function bindFileTreeEvents() {
    el.fileTree.querySelectorAll('.file-tree-refresh-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await updateFileTree({ forceRefresh: true });
        });
    });

    el.fileTree.querySelectorAll('.file-tree-item').forEach(item => {
        item.addEventListener('click', async (event) => {
            if (event.target.closest('.file-tree-refresh-btn')) return;
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
            await openPath(path, {
                pushHistory: true,
                setHome: false,
                newTab: state.isEditing,
            });
        });
    });
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
