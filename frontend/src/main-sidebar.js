/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el, getPathDirname, documentTypeFromPath } from './main-state.js';
import { handleSearch, updateSearchClearButton, handleSearchInputKeydown, clearSearchInput } from './main-ui.js';
import { debounce } from './main-state.js';

let isSidebarOpen = false;
let activeSidebarTab = 'files';

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
        return `
            <div class="outline-item level-${level}" data-index="${index}">
                <span class="outline-text">${text}</span>
            </div>
        `;
    }).join('');

    el.markdownOutline.querySelectorAll('.outline-item').forEach(item => {
        item.onclick = () => {
            const index = item.dataset.index;
            headings[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
    });
}

async function updateFileTree() {
    if (!el.fileTree) return;

    if (!state.currentFolder) {
        el.fileTree.innerHTML = '<div class="sidebar-hint">Open a folder or file to view tree.</div>';
        return;
    }

    // For now, just show the current folder name and a placeholder
    // In a real implementation, we would call a backend function to list files.
    // We can reuse the "Recent Files" style or similar.
    const folderName = basename(state.currentFolder);
    el.fileTree.innerHTML = `
        <div class="file-tree-header">
            <span class="material-symbols-outlined">folder_open</span>
            <span class="folder-name">${folderName}</span>
        </div>
        <div class="sidebar-hint">File tree implementation coming soon...</div>
    `;
}

function basename(path) {
    const normalized = (path || '').replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || path;
}
