/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el, getScroller, escapeRegex, escapeAttr, getPathDirname } from './main-state.js';
import { SearchMarkdown } from '../wailsjs/go/main/App';
import { ClipboardGetText, ClipboardSetText, LogError } from '../wailsjs/runtime/runtime';

// ── Module-level State ─────────────────────────────────────
let hlMatches = [];
let hlCurrent = -1;
let toastTimer = null;
let progressHideTimer = null;
let contextMenuState = null;
let activeProgressTaskId = 0;

// ── Toast ──────────────────────────────────────────────────

export function showToast(msg, duration = 2400) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), duration);
}

// ── Progress Widget ────────────────────────────────────────

export function showProgress(title, progress = null) {
    clearTimeout(progressHideTimer);
    el.progressTitle.textContent = title;
    el.progressTitle.classList.toggle('shimmering', /rendering document/i.test(title));
    if (typeof progress === 'number') {
        const clamped = Math.max(0, Math.min(100, progress));
        el.progressValue.textContent = `${clamped}%`;
        el.progressFill.classList.remove('indeterminate');
        el.progressFill.style.width = `${clamped}%`;
    } else {
        el.progressValue.textContent = "";
        el.progressFill.style.width = "";
        el.progressFill.classList.add('indeterminate');
    }
    el.progressWidget.classList.remove('hidden');
    requestAnimationFrame(() => el.progressWidget.classList.add('show'));
}

export function hideProgress() {
    clearTimeout(progressHideTimer);
    el.progressTitle.classList.remove('shimmering');
    progressHideTimer = setTimeout(() => {
        el.progressWidget.classList.remove('show');
        setTimeout(() => el.progressWidget.classList.add('hidden'), 250);
    }, 400);
}

export function updateProgress(title, progress = null) {
    showProgress(title, progress);
}

export function beginProgressTask(title, progress = null) {
    activeProgressTaskId += 1;
    const taskId = activeProgressTaskId;
    showProgress(title, progress);
    return taskId;
}

export function isProgressTaskActive(taskId) {
    return taskId !== 0 && taskId === activeProgressTaskId;
}

export function createCancelledTaskError() {
    const error = new Error('Task cancelled');
    error.name = 'TaskCancelledError';
    return error;
}

export function throwIfTaskCancelled(taskId) {
    if (!isProgressTaskActive(taskId)) {
        throw createCancelledTaskError();
    }
}

export function finishProgressTask(taskId) {
    if (!isProgressTaskActive(taskId)) {
        return;
    }

    updateProgress('Done', 100);
    hideProgress();
}

export function cancelProgressTask(taskId) {
    if (!isProgressTaskActive(taskId)) {
        return false;
    }

    activeProgressTaskId += 1;
    // cleanupHTMLFrame is called lazily to avoid circular dependency at load time
    import('./main-render.js').then(mod => mod.cleanupHTMLFrame({ resetSource: true }));
    hideProgress();
    return true;
}

export function isCancelledTaskError(error) {
    return error?.name === 'TaskCancelledError';
}

export async function yieldToUI() {
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export async function cancelCurrentTask() {
    if (cancelProgressTask(activeProgressTaskId)) {
        showToast('Loading cancelled.');
    }
}

// ── Clipboard ──────────────────────────────────────────────

export async function copyTextToClipboard(text) {
    try {
        const copied = await ClipboardSetText(text);
        if (copied) {
            return;
        }
    } catch (error) {
        LogError(`clipboard runtime copy failed: ${error?.message || error}`);
    }

    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            LogError(`clipboard web copy failed: ${error?.message || error}`);
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

// ── Search ─────────────────────────────────────────────────

export function toggleSearch() {
    el.searchSidebar.classList.toggle('hidden');
    updateSearchClearButton();
}

export async function handleSearch() {
    const query = el.searchInput.value.trim();
    const folders = getSearchFolders();
    if (!query || folders.length === 0) {
        el.searchResults.innerHTML = '<div class="search-hint">Type a search keyword and keep a file open.</div>';
        return;
    }
    el.searchResults.innerHTML = '<div class="search-hint">Searching...</div>';
    const resultGroups = await Promise.all(folders.map(folder => SearchMarkdown(folder, query)));
    const results = mergeSearchResults(resultGroups.flat());
    if (!results || results.length === 0) {
        el.searchResults.innerHTML = '<div class="search-hint">No results found</div>';
        return;
    }
    el.searchResults.innerHTML = results.map(result => `
        <div class="result-item recent-item" data-path="${result.path}" data-keyword="${escapeAttr(query)}">
            <span class="recent-name">${result.name}</span>
            <span class="recent-path">${result.path}</span>
        </div>
    `).join('');
}

export function updateSearchClearButton() {
    el.btnClearSearch.classList.toggle('hidden', !el.searchInput.value.trim());
}

export function clearSearchInput() {
    el.searchInput.value = "";
    updateSearchClearButton();
    el.searchResults.innerHTML = '<div class="search-hint">Open a file then type to search.</div>';
    el.searchInput.focus();
}

export async function handleSearchInputKeydown(event) {
    if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
    }

    const key = event.key.toLowerCase();
    if (!['a', 'c', 'v', 'x'].includes(key)) {
        return;
    }

    if (key === 'a') {
        event.preventDefault();
        el.searchInput.select();
        return;
    }

    const hasSelection = el.searchInput.selectionStart !== el.searchInput.selectionEnd;

    // 검색창 내부 Cmd+C/X 단축키 지원 복원
    if (key === 'c' && hasSelection) {
        event.preventDefault();
        copyTextToClipboard(el.searchInput.value.slice(el.searchInput.selectionStart, el.searchInput.selectionEnd))
            .then(() => showToast('Copied selection. 📋'));
        return;
    }

    if (key === 'x' && hasSelection) {
        event.preventDefault();
        copyTextToClipboard(el.searchInput.value.slice(el.searchInput.selectionStart, el.searchInput.selectionEnd))
            .then(() => showToast('Cut selection. ✂️'));
        el.searchInput.setRangeText("", el.searchInput.selectionStart, el.searchInput.selectionEnd, 'start');
        updateSearchClearButton();
        handleSearch();
        return;
    }

    if (key === 'v') {
        event.preventDefault();
        try {
            const text = await ClipboardGetText();
            if (typeof text === 'string') {
                el.searchInput.setRangeText(text, el.searchInput.selectionStart, el.searchInput.selectionEnd, 'end');
                updateSearchClearButton();
                await handleSearch();
            }
        } catch (error) {
            LogError(`clipboard paste failed: ${error?.message || error}`);
        }
    }
}

export async function searchForQuery(query) {
    const trimmed = query.trim();
    if (!trimmed) return;
    el.searchSidebar.classList.remove('hidden');
    el.searchInput.value = trimmed;
    await handleSearch();
}

function getSearchFolders() {
    const folders = new Set();

    if (state.currentFolder) {
        folders.add(state.currentFolder);
    }

    if (!el.searchOpenTabFolders.checked) {
        return Array.from(folders);
    }

    state.tabs.forEach(tab => {
        if (tab.kind !== 'document') {
            return;
        }
        const folder = getPathDirname(tab.path);
        if (folder) {
            folders.add(folder);
        }
    });

    return Array.from(folders);
}

function mergeSearchResults(results) {
    const seen = new Set();
    return results
        .filter(result => result?.path)
        .filter(result => {
            if (seen.has(result.path)) {
                return false;
            }
            seen.add(result.path);
            return true;
        })
        .sort((a, b) => a.path.localeCompare(b.path));
}

// ── Highlight ──────────────────────────────────────────────

export function applyHighlight(keyword) {
    if (!keyword) return;
    clearHighlight();

    const container = el.markdownContainer;
    const regex = new RegExp(escapeRegex(keyword), 'gi');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const tag = node.parentElement?.tagName?.toLowerCase();
            if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    for (let i = textNodes.length - 1; i >= 0; i--) {
        const textNode = textNodes[i];
        if (!regex.test(textNode.nodeValue)) continue;
        regex.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(textNode.nodeValue)) !== null) {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIndex, match.index)));
            }
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = match[0];
            fragment.appendChild(mark);
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < textNode.nodeValue.length) {
            fragment.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIndex)));
        }
        textNode.parentNode.replaceChild(fragment, textNode);
    }

    hlMatches = Array.from(container.querySelectorAll('.search-highlight'));
    if (hlMatches.length === 0) {
        showToast(`Cannot find "${keyword}".`);
        return;
    }

    hlCurrent = 0;
    activateHl(hlCurrent);
    updateHlCounter();
    el.highlightNav.classList.remove('hidden');
}

export function clearHighlight() {
    el.markdownContainer.querySelectorAll('.search-highlight').forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent));
    });
    el.markdownContainer.normalize();
    hlMatches = [];
    hlCurrent = -1;
    el.highlightNav.classList.add('hidden');
}

function activateHl(index) {
    hlMatches.forEach((mark, idx) => mark.classList.toggle('active', idx === index));
    hlMatches[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateHlCounter() {
    el.hlCounter.textContent = `${hlCurrent + 1} / ${hlMatches.length}`;
}

// ── Highlight Navigation Binding ───────────────────────────

export function bindHighlightNav() {
    el.btnHlNext.addEventListener('click', () => {
        if (hlMatches.length === 0) return;
        const wasLast = hlCurrent === hlMatches.length - 1;
        hlCurrent = (hlCurrent + 1) % hlMatches.length;
        activateHl(hlCurrent);
        updateHlCounter();
        if (wasLast) showToast('Last result. Returning to the start. 🔄');
    });

    el.btnHlPrev.addEventListener('click', () => {
        if (hlMatches.length === 0) return;
        const wasFirst = hlCurrent === 0;
        hlCurrent = (hlCurrent - 1 + hlMatches.length) % hlMatches.length;
        activateHl(hlCurrent);
        updateHlCounter();
        if (wasFirst) showToast('First result. Returning to the end. 🔄');
    });

    el.btnHlClose.addEventListener('click', () => clearHighlight());
}

// ── Context Menu ───────────────────────────────────────────

export function bindContextMenu() {
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', event => {
        if (!event.target.closest('#context-menu')) {
            closeContextMenu();
        }
    });
    document.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('blur', closeContextMenu);

    bindContextMenuAction(el.contextCopy, async () => {
        if (!contextMenuState?.selectionText) return;
        await copyTextToClipboard(contextMenuState.selectionText);
        closeContextMenu();
        showToast('Copied selection. 📋');
    });

    bindContextMenuAction(el.contextPaste, async () => {
        if (contextMenuState?.isEditor) {
            try {
                const text = await ClipboardGetText();
                if (typeof text === 'string') {
                    const mod = await import('./main-editor.js');
                    // 포커스를 잃었을 수 있으므로 다시 포커스
                    contextMenuState.targetElement.focus();
                    mod.insertTextAtCursor(text, '');
                    showToast('Pasted. 📋');
                }
            } catch (error) {
                LogError(`clipboard paste failed: ${error?.message || error}`);
            }
        }
        closeContextMenu();
    });

    bindContextMenuAction(el.contextSelectAll, async () => {
        if (contextMenuState?.targetElement) {
            contextMenuState.targetElement.focus();
            contextMenuState.targetElement.select();
        }
        closeContextMenu();
    });

    bindContextMenuAction(el.contextSearch, async () => {
        if (!contextMenuState?.selectionText) return;
        await searchForQuery(contextMenuState.selectionText);
        closeContextMenu();
    });

    bindContextMenuAction(el.contextOpen, async () => {
        if (!contextMenuState?.linkHref) return;
        await openContextLink(contextMenuState.linkHref, false);
        closeContextMenu();
    });

    bindContextMenuAction(el.contextOpenNewTab, async () => {
        if (!contextMenuState?.linkHref) return;
        await openContextLink(contextMenuState.linkHref, true);
        closeContextMenu();
    });
}

function bindContextMenuAction(element, action) {
    element.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await action();
    });
}

function handleContextMenu(event) {
    const isEditor = event.target.id === 'markdown-editor';
    const selectionText = isEditor 
        ? event.target.value.substring(event.target.selectionStart, event.target.selectionEnd)
        : window.getSelection()?.toString() || "";
        
    const linkNode = event.target.closest('a[href]');
    const inMarkdown = !!event.target.closest('#markdown-container');

    if (!isEditor) {
        if (!selectionText && !linkNode) {
            closeContextMenu();
            return;
        }

        if (!inMarkdown && !selectionText) {
            closeContextMenu();
            return;
        }
    }

    event.preventDefault();
    const linkHref = linkNode?.getAttribute('href') || "";
    const showLinkActions = !!linkHref;
    const showSelectionActions = !showLinkActions && !!selectionText;
    
    contextMenuState = {
        selectionText: showSelectionActions ? selectionText : "",
        linkHref,
        isEditor,
        targetElement: event.target
    };

    el.contextCopy.classList.toggle('hidden', !showSelectionActions);
    
    if (isEditor) {
        el.contextPaste.classList.remove('hidden');
        el.contextSelectAll.classList.remove('hidden');
        el.contextSearch.classList.add('hidden');
        el.contextOpen.classList.add('hidden');
        el.contextOpenNewTab.classList.add('hidden');
    } else {
        el.contextPaste.classList.add('hidden');
        el.contextSelectAll.classList.add('hidden');
        el.contextSearch.classList.toggle('hidden', !showSelectionActions);
        el.contextOpen.classList.toggle('hidden', !showLinkActions);
        el.contextOpenNewTab.classList.toggle('hidden', !showLinkActions);
    }

    positionContextMenu(event.clientX, event.clientY);
}

function positionContextMenu(x, y) {
    el.contextMenu.classList.remove('show');
    el.contextMenu.classList.add('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'true');
    el.contextMenu.classList.remove('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'false');

    const menuRect = el.contextMenu.getBoundingClientRect();
    const maxX = window.innerWidth - menuRect.width - 10;
    const maxY = window.innerHeight - menuRect.height - 10;
    el.contextMenu.style.left = `${Math.max(10, Math.min(x, maxX))}px`;
    el.contextMenu.style.top = `${Math.max(10, Math.min(y, maxY))}px`;
    requestAnimationFrame(() => el.contextMenu.classList.add('show'));
}

export function closeContextMenu() {
    contextMenuState = null;
    el.contextMenu.classList.remove('show');
    el.contextMenu.classList.add('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'true');
}

async function openContextLink(href, newTab) {
    const { isExternalURL } = await import('./main-state.js');
    const { openExternalURL, resolveLink } = await import('./main-navigation.js');
    if (isExternalURL(href)) {
        await openExternalURL(href);
        return;
    }
    resolveLink(href, { newTab });
}
