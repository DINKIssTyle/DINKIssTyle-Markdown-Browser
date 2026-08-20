/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el, getScroller, escapeRegex, escapeAttr, escapeHTML, getPathDirname, basename } from './main-state.js';
import { SearchMarkdown, CancelAIRequest } from '../bindings/dinkisstyle-markdown-browser/internal/app/app';
import { ClipboardGetText, ClipboardSetText, LogError } from './wails-runtime';
import { createCancelledTaskError, isCancellationError } from './main-cancel.js';
import { createDeltaTicker, normalizeDeltaText } from './main-delta-ticker.js';
import { isIOSPlatform, isMobilePlatform } from './platform-common.js';

// ── Module-level State ─────────────────────────────────────
let hlMatches = [];
let hlCurrent = -1;
let toastTimer = null;
let progressHideTimer = null;
let progressDeltaHideTimer = null;
let contextMenuState = null;
let mobileSelectionMenuTimer = null;
let activeProgressTaskId = 0;

// ── Toast ──────────────────────────────────────────────────

export function showToast(msg, icon = null, duration = 2400) {
	resetToast();
    if (icon) {
        const iconElement = document.createElement('span');
        iconElement.className = 'material-symbols-outlined toast-icon';
        iconElement.textContent = icon;
        el.toast.append(iconElement);
    }
    const textElement = document.createElement('span');
    textElement.className = 'toast-text';
    textElement.textContent = msg;
    textElement.title = msg;
    el.toast.append(textElement);
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), duration);
}

export function showActionToast(msg, { icon = null, actionLabel = '', onAction = null, dismissible = true, duration = 0 } = {}) {
    resetToast();
    el.toast.classList.add('is-interactive');

    if (icon) {
        const iconElement = document.createElement('span');
        iconElement.className = 'material-symbols-outlined toast-icon';
        iconElement.textContent = icon;
        el.toast.append(iconElement);
    }

    const textElement = document.createElement('span');
    textElement.className = 'toast-text';
    textElement.textContent = msg;
    el.toast.append(textElement);

    if (actionLabel) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'toast-action';
        action.textContent = actionLabel;
        action.addEventListener('click', () => {
            hideToast();
            onAction?.();
        });
        el.toast.append(action);
    }

    if (dismissible) {
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'toast-dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss notification');
        dismiss.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">close</span>';
        dismiss.addEventListener('click', hideToast);
        el.toast.append(dismiss);
    }

    el.toast.classList.add('show');
    if (duration > 0) {
        toastTimer = setTimeout(hideToast, duration);
    }
}

export function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    el.toast.classList.remove('show', 'is-interactive');
}

function resetToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    el.toast.classList.remove('show', 'is-interactive');
    el.toast.replaceChildren();
}

// ── Progress Widget ────────────────────────────────────────

const WAVING_PROGRESS_TITLE_PATTERN = /checking spelling|starting translation|translating document/i;
const PROGRESS_DELTA_INTERVAL_MS = 180;
const PROGRESS_DELTA_HIDE_MS = 900;
const PROGRESS_DELTA_COALESCE_MS = 220;
const PROGRESS_DELTA_MIN_CHARS = 18;
const PROGRESS_DELTA_MAX_QUEUE = 18;
const PROGRESS_DELTA_MAX_CHARS = 88;

function renderProgressTitle(title, { wavingDots = false } = {}) {
    el.progressTitle.textContent = "";
    el.progressTitle.removeAttribute('aria-label');
    el.progressTitle.classList.toggle('dots-waving', wavingDots);

    if (!wavingDots) {
        el.progressTitle.textContent = title;
        return;
    }

    const baseTitle = title.replace(/\.{3}\s*$/, '');
    const displayTitle = `${baseTitle}...`;
    el.progressTitle.setAttribute('aria-label', displayTitle);
    el.progressTitle.appendChild(document.createTextNode(baseTitle));
    for (let index = 0; index < 3; index += 1) {
        const dot = document.createElement('span');
        dot.className = 'progress-title-dot';
        dot.textContent = '.';
        dot.setAttribute('aria-hidden', 'true');
        dot.style.setProperty('--dot-index', String(index));
        el.progressTitle.appendChild(dot);
    }
}

export function showProgress(title, progress = null, options = {}) {
    clearTimeout(progressHideTimer);
    const isWavingTitle = WAVING_PROGRESS_TITLE_PATTERN.test(title);
    renderProgressTitle(title, { wavingDots: isWavingTitle });
    const isActive = options.active !== false;
    el.progressTitle.classList.toggle('shimmering', /rendering document/i.test(title));
    el.progressFill.classList.toggle('active', isActive);
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
    clearProgressDelta();
    el.progressTitle.classList.remove('shimmering');
    el.progressTitle.classList.remove('dots-waving');
    el.progressTitle.removeAttribute('aria-label');
    progressHideTimer = setTimeout(() => {
        el.progressWidget.classList.remove('show');
        setTimeout(() => el.progressWidget.classList.add('hidden'), 250);
    }, 400);
}

export function updateProgress(title, progress = null, options = {}) {
    showProgress(title, progress, options);
}

function renderProgressDelta(text = "") {
    if (!el.progressStreamTicker || !el.progressStreamText) {
        return;
    }
    clearTimeout(progressDeltaHideTimer);
    el.progressStreamText.textContent = text;
    el.progressWidget.classList.add('has-stream-delta');
    el.progressStreamTicker.classList.remove('is-visible');
    requestAnimationFrame(() => {
        el.progressStreamTicker?.classList.add('is-visible');
    });
    progressDeltaHideTimer = setTimeout(() => {
        el.progressStreamTicker?.classList.remove('is-visible');
        el.progressWidget?.classList.remove('has-stream-delta');
    }, PROGRESS_DELTA_HIDE_MS);
}

const progressDeltaTicker = createDeltaTicker({
    render: renderProgressDelta,
    clearRender: clearRenderedProgressDelta,
    normalize: value => normalizeDeltaText(value, { stripJsonPunctuation: true }),
    intervalMs: PROGRESS_DELTA_INTERVAL_MS,
    coalesceMs: PROGRESS_DELTA_COALESCE_MS,
    minChars: PROGRESS_DELTA_MIN_CHARS,
    maxQueue: PROGRESS_DELTA_MAX_QUEUE,
    maxChars: PROGRESS_DELTA_MAX_CHARS,
    canShow: () => !!el.progressWidget && !el.progressWidget.classList.contains('hidden'),
});

export function showProgressDelta(value = "") {
    progressDeltaTicker.push(value);
}

function clearRenderedProgressDelta() {
    clearTimeout(progressDeltaHideTimer);
    progressDeltaHideTimer = null;
    el.progressWidget?.classList.remove('has-stream-delta');
    el.progressStreamTicker?.classList.remove('is-visible');
    if (el.progressStreamText) {
        el.progressStreamText.textContent = "";
    }
}

function clearProgressDelta() {
    progressDeltaTicker.clear();
}

export function beginProgressTask(title, progress = null, options = {}) {
    activeProgressTaskId += 1;
    const taskId = activeProgressTaskId;
    showProgress(title, progress, options);
    return taskId;
}

export function isProgressTaskActive(taskId) {
    return taskId !== 0 && taskId === activeProgressTaskId;
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
    return isCancellationError(error);
}

export async function yieldToUI() {
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export async function cancelCurrentTask() {
    if (cancelProgressTask(activeProgressTaskId)) {
        try {
            await CancelAIRequest();
        } catch (error) {
            LogError(`CancelAIRequest failed: ${error?.message || error}`);
        }
        showToast('Task cancelled.');
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
    import('./main-sidebar.js').then(mod => {
        mod.openSidebarTab('search');
        el.searchInput?.focus();
        el.searchInput?.select();
    });
}

export async function handleSearch() {
    const query = el.searchInput.value.trim();
    if (isMobilePlatform() || window.innerWidth <= 768) {
        await renderCurrentDocumentSearch(query);
        return;
    }
    const folders = getSearchFolders();
    if (!query || folders.length === 0) {
        await renderCurrentDocumentSearch(query);
        return;
    }
    el.searchResults.innerHTML = '<div class="search-hint">Searching...</div>';
    try {
        const resultGroups = await Promise.all(folders.map(folder => SearchMarkdown(folder, query).catch(() => [])));
        const results = mergeSearchResults(resultGroups.flat());
        if (results.length === 0) {
            await renderCurrentDocumentSearch(query);
            return;
        }
        el.searchResults.innerHTML = results.map(result => `
            <div class="result-item recent-item" data-path="${escapeAttr(result.path)}" data-keyword="${escapeAttr(query)}" tabindex="0">
                <div class="recent-file-text">
                    <span class="recent-name">${escapeHTML(basename(result.path))}</span>
                    <span class="recent-path">${escapeHTML(result.path)}</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        await renderCurrentDocumentSearch(query);
    }
}

async function renderCurrentDocumentSearch(query) {
    if (!query) {
        el.searchResults.innerHTML = '<div class="search-hint">Type a search keyword.</div>';
        return;
    }

    const { getActiveTab } = await import('./main-tabs.js');
    const { getCurrentEditorText } = await import('./main-editor.js');

    const normalizedQuery = query.toLocaleLowerCase();
    const matches = [];

    const openTabs = Array.isArray(state.tabs) && state.tabs.length > 0 ? state.tabs : [getActiveTab()].filter(Boolean);

    for (const tab of openTabs) {
        let source = "";
        if (tab.isEditing && tab.id === getActiveTab()?.id) {
            source = getCurrentEditorText();
        }
        if (!source) {
            source = tab.currentMarkdownSource || tab.editorOriginalContent || (tab.id === getActiveTab()?.id ? state.currentMarkdownSource : '');
        }
        if (!source && tab.id === getActiveTab()?.id && el.markdownContainer) {
            source = el.markdownContainer.textContent || el.markdownContainer.innerText || '';
        }

        if (!source) continue;

        const path = tab.editingSourcePath || tab.path || state.currentFilePath || 'Untitled.md';
        const documentName = basename(path) || tab.title || 'Document';

        let matchOffset = 0;
        source.split(/\r?\n/).forEach((line, index) => {
            const normalizedLine = line.toLocaleLowerCase();
            let occurrence = normalizedLine.indexOf(normalizedQuery);
            if (occurrence < 0) return;

            matches.push({
                tabId: tab.id,
                path,
                documentName,
                line: index + 1,
                text: line.trim() || 'Blank line',
                matchIndex: matchOffset,
            });

            while (occurrence >= 0) {
                matchOffset += 1;
                occurrence = normalizedLine.indexOf(normalizedQuery, occurrence + Math.max(1, normalizedQuery.length));
            }
        });
    }

    matches.splice(250);

    if (matches.length === 0) {
        el.searchResults.innerHTML = '<div class="search-hint">No results found in open documents.</div>';
        return;
    }

    el.searchResults.innerHTML = matches.map(result => `
        <div class="result-item recent-item" data-tab-id="${escapeAttr(result.tabId || '')}" data-path="${escapeAttr(result.path)}" data-keyword="${escapeAttr(query)}" data-line="${result.line}" data-match-index="${result.matchIndex}" tabindex="0">
            <div class="recent-file-text">
                <span class="recent-name">${escapeHTML(result.documentName)} · Line ${result.line}</span>
                <span class="recent-path">${escapeHTML(result.text)}</span>
            </div>
        </div>
    `).join('');
}

export function updateSearchClearButton() {
    if (!el.btnClearSearch) return;
    const hasValue = Boolean(el.searchInput && el.searchInput.value.length > 0);
    el.btnClearSearch.classList.toggle('hidden', !hasValue);
}

export function clearSearchInput(event) {
    if (event) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    if (el.searchInput) {
        el.searchInput.value = "";
        el.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        try {
            el.searchInput.focus();
        } catch (_) {}
    }
    updateSearchClearButton();
    if (el.searchResults) {
        el.searchResults.innerHTML = '<div class="search-hint">Type a search keyword.</div>';
    }
    handleSearch();
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
            .then(() => showToast('Copied selection.', 'content_copy'));
        return;
    }

    if (key === 'x' && hasSelection) {
        event.preventDefault();
        copyTextToClipboard(el.searchInput.value.slice(el.searchInput.selectionStart, el.searchInput.selectionEnd))
            .then(() => showToast('Cut selection.', 'content_cut'));
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
    
    const mod = await import('./main-sidebar.js');
    mod.openSidebarTab('search');
    
    el.searchInput.value = trimmed;
    updateSearchClearButton();
    await handleSearch();
    requestAnimationFrame(() => {
        el.searchInput?.focus();
        el.searchInput?.select();
    });
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

export function applyHighlight(keyword, preferredIndex = 0) {
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

    hlCurrent = Math.max(0, Math.min(Number(preferredIndex) || 0, hlMatches.length - 1));
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
    const mark = hlMatches[index];
    if (!mark) return;
    try {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {
        const scroller = getScroller();
        if (scroller && mark) {
            const markRect = mark.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();
            const targetTop = scroller.scrollTop + markRect.top - scrollerRect.top - (scroller.clientHeight / 2);
            scroller.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        }
    }
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
        if (wasLast) showToast('Last result. Returning to the start.', 'history');
    });

    el.btnHlPrev.addEventListener('click', () => {
        if (hlMatches.length === 0) return;
        const wasFirst = hlCurrent === 0;
        hlCurrent = (hlCurrent - 1 + hlMatches.length) % hlMatches.length;
        activateHl(hlCurrent);
        updateHlCounter();
        if (wasFirst) showToast('First result. Returning to the end.', 'history');
    });

    el.btnHlClose.addEventListener('click', () => clearHighlight());
}

// ── Context Menu ───────────────────────────────────────────

export function bindInputPasteSanitization() {
    document.addEventListener('paste', event => {
        const target = event.target;
        if (!target || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
        if (target.closest('.cm-editor')) return;
        if (target.readOnly || target.disabled) return;
        if (target.type === 'file' || target.type === 'checkbox' || target.type === 'radio' || target.type === 'range') return;

        const rawText = event.clipboardData?.getData('text/plain');
        if (typeof rawText === 'string' && rawText.length > 0) {
            event.preventDefault();
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? target.value.length;
            const val = target.value;
            target.value = val.slice(0, start) + rawText + val.slice(end);
            target.selectionStart = target.selectionEnd = start + rawText.length;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, true);
}

export function bindContextMenu() {
    bindInputPasteSanitization();
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
        if (isIOSPlatform()) window.getSelection()?.removeAllRanges();
        closeContextMenu();
        showToast('Copied selection.', 'content_copy');
    });

    bindContextMenuAction(el.contextCut, async () => {
        if (!contextMenuState?.isEditor || !contextMenuState.selectionText) return;
        try {
            await copyTextToClipboard(contextMenuState.selectionText);
            const mod = await import('./main-editor.js');
            if (mod.cmView) {
                const selection = mod.cmView.state.selection.main;
                if (!selection.empty) {
                    mod.cmView.focus();
                    mod.cmView.dispatch({
                        changes: { from: selection.from, to: selection.to, insert: '' },
                        selection: { anchor: selection.from }
                    });
                    showToast('Cut selection.', 'content_cut');
                }
            }
        } catch (error) {
            LogError(`clipboard cut failed: ${error?.message || error}`);
        }
        closeContextMenu();
    });

    bindContextMenuAction(el.contextPaste, async () => {
        if (contextMenuState?.isEditor) {
            try {
                const text = await ClipboardGetText();
                if (typeof text === 'string') {
                    const mod = await import('./main-editor.js');
                    if (mod.cmView) {
                        mod.cmView.focus();
                        mod.insertTextAtCursor(text, '');
                        showToast('Pasted.', 'content_paste');
                    }
                }
            } catch (error) {
                LogError(`clipboard paste failed: ${error?.message || error}`);
            }
        }
        closeContextMenu();
    });

    bindContextMenuAction(el.contextSelectAll, async () => {
        if (contextMenuState?.isEditor) {
            const mod = await import('./main-editor.js');
            if (mod.cmView) {
                mod.cmView.focus();
                mod.cmView.dispatch({
                    selection: { anchor: 0, head: mod.cmView.state.doc.length }
                });
            }
        } else if (contextMenuState?.targetElement) {
            contextMenuState.targetElement.focus();
            if (typeof contextMenuState.targetElement.select === 'function') {
                contextMenuState.targetElement.select();
            }
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

async function handleContextMenu(event) {
    if (isMobilePlatform()) {
        closeContextMenu();
        return;
    }

    const cmEditor = event.target.closest('.cm-editor');
    const isEditor = !!cmEditor;

    let selectionText = "";
    if (isEditor) {
        const mod = await import('./main-editor.js');
        if (mod.cmView) {
            const sel = mod.cmView.state.selection.main;
            selectionText = mod.cmView.state.sliceDoc(sel.from, sel.to);
        }
    } else {
        selectionText = window.getSelection()?.toString() || "";
    }
        
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
    
    showContextMenuForState({
        selectionText: showSelectionActions ? selectionText : "",
        linkHref,
        isEditor,
        targetElement: event.target,
    }, event.clientX, event.clientY);
}

function showContextMenuForState(nextState, x, y) {
    contextMenuState = nextState;
    const { selectionText, linkHref, isEditor } = nextState;
    const showLinkActions = !!linkHref;
    const showSelectionActions = !showLinkActions && !!selectionText;

    el.contextCut.classList.toggle('hidden', !isEditor || !selectionText);
    el.contextCopy.classList.toggle('hidden', !selectionText);
    
    if (isEditor) {
        el.contextPaste.classList.remove('hidden');
        el.contextSelectAll.classList.remove('hidden');
        el.contextSearch.classList.add('hidden');
        el.contextOpen.classList.add('hidden');
        el.contextOpenNewTab.classList.add('hidden');
    } else {
        el.contextCut.classList.add('hidden');
        el.contextPaste.classList.add('hidden');
        el.contextSelectAll.classList.toggle('hidden', true); // No select all for general view
        el.contextSearch.classList.toggle('hidden', !showSelectionActions);
        el.contextOpen.classList.toggle('hidden', !showLinkActions);
        el.contextOpenNewTab.classList.toggle('hidden', !showLinkActions);
    }

    positionContextMenu(x, y);
}

function getIOSSelectionText() {
    if (state.isEditing) return '';
    return window.getSelection()?.toString().trim() || '';
}

function scheduleIOSSelectionContextMenu(pointerEvent = null) {
    window.clearTimeout(mobileSelectionMenuTimer);
    mobileSelectionMenuTimer = window.setTimeout(() => {
        void showIOSSelectionContextMenu(pointerEvent);
    }, 120);
}

async function showIOSSelectionContextMenu(pointerEvent) {
    if (!isMobilePlatform() || pointerEvent?.target?.closest?.('#context-menu')) return;

    const editorTarget = pointerEvent?.target?.closest?.('.cm-editor');
    if (state.isEditing && (editorTarget || document.activeElement?.closest?.('.cm-editor'))) {
        const mod = await import('./main-editor.js');
        const selection = mod.cmView?.state.selection.main;
        if (!selection || selection.empty) {
            closeContextMenu();
            return;
        }
        const selectionText = mod.cmView.state.sliceDoc(selection.from, selection.to);
        const coords = mod.cmView.coordsAtPos(selection.head);
        if (!selectionText || !coords) return;
        showContextMenuForState({
            selectionText,
            linkHref: '',
            isEditor: true,
            targetElement: editorTarget || mod.cmView.dom,
        }, coords.left, coords.bottom + 8);
        return;
    }

    const selection = window.getSelection();
    const selectionText = selection?.toString().trim() || '';
    if (!selectionText || !selection.rangeCount) {
        closeContextMenu();
        return;
    }
    const range = selection.getRangeAt(0);
    const targetNode = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    const targetElement = targetNode?.closest?.('#markdown-container');
    if (!targetElement) return;
    const rect = range.getBoundingClientRect();
    showContextMenuForState({
        selectionText,
        linkHref: '',
        isEditor: false,
        targetElement,
    }, rect.left + (rect.width / 2), rect.bottom + 8);
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
    window.clearTimeout(mobileSelectionMenuTimer);
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
