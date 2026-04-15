/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { marked } from 'marked';
import katex from 'katex';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import mermaid from 'mermaid';

import {
    state, el, getScroller, HOME_SCREEN_PATH,
    joinPath, formatDisplayPath, isExternalURL, splitLinkTarget, syncEngineSelector, getPathDirname,
    isBundledDocumentPath, normalizeAppLocalFileHref, normalizeFileURLPath, isActiveMarkdownEditTab,
} from './main-state.js';
import { getActiveTab } from './main-tabs.js';
import { exitEditMode, getCurrentEditorText } from './main-editor.js';
import { applyHighlight, clearHighlight } from './main-ui.js';
import { GetRecentFiles, ReadFile, ReadImageAsDataURL } from '../wailsjs/go/main/App';
import { LogError, LogInfo } from '../wailsjs/runtime/runtime';

// ── Module-level State ─────────────────────────────────────
let recentFilesCache = [];
let htmlFrameResizeObserver = null;
const MATH_DATA_ATTR = 'data-dkst-math';
const MATH_DISPLAY_ATTR = 'data-dkst-math-display';
const LIVE_BLOCK_ATTR = 'data-dkst-live-block-index';
let previewRenderToken = 0;
let editorIdleFullRenderHandle = null;
let editorIdleFullRenderTimer = 0;
let livePreviewBlocks = [];

function isEscaped(text, index) {
    let slashCount = 0;
    for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
        slashCount += 1;
    }
    return slashCount % 2 === 1;
}

function encodeMathPayload(value) {
    return encodeURIComponent(value)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');
}

function decodeMathPayload(value) {
    return decodeURIComponent(value);
}

function createMathPlaceholder(math, displayMode) {
    const payload = encodeMathPayload(math);
    return `<span class="dkst-math-placeholder" ${MATH_DATA_ATTR}="${payload}" ${MATH_DISPLAY_ATTR}="${displayMode ? 'true' : 'false'}"></span>`;
}

function findMatchingDelimiter(text, start, delimiter) {
    let searchIndex = start;
    while (searchIndex < text.length) {
        const found = text.indexOf(delimiter, searchIndex);
        if (found === -1) {
            return -1;
        }
        if (!isEscaped(text, found)) {
            return found;
        }
        searchIndex = found + delimiter.length;
    }
    return -1;
}

function isInlineMathStart(text, index) {
    const next = text[index + 1] || '';
    if (!next || next === '$' || /\s/.test(next)) {
        return false;
    }
    const prev = text[index - 1] || '';
    return !/\d/.test(prev);
}

function isInlineMathEnd(text, index) {
    const prev = text[index - 1] || '';
    const next = text[index + 1] || '';
    if (!prev || /\s/.test(prev)) {
        return false;
    }
    return !/\d/.test(next);
}

function transformMarkdownMath(segment) {
    let out = '';
    let i = 0;
    while (i < segment.length) {
        if (segment[i] === '`') {
            let tickCount = 1;
            while (segment[i + tickCount] === '`') {
                tickCount += 1;
            }
            const fence = '`'.repeat(tickCount);
            const end = segment.indexOf(fence, i + tickCount);
            if (end === -1) {
                out += segment.slice(i);
                break;
            }
            out += segment.slice(i, end + tickCount);
            i = end + tickCount;
            continue;
        }

        if (segment.startsWith('$$', i) && !isEscaped(segment, i)) {
            const end = findMatchingDelimiter(segment, i + 2, '$$');
            if (end !== -1) {
                out += createMathPlaceholder(segment.slice(i + 2, end).trim(), true);
                i = end + 2;
                continue;
            }
        }

        if (segment.startsWith('\\[', i) && !isEscaped(segment, i)) {
            const end = findMatchingDelimiter(segment, i + 2, '\\]');
            if (end !== -1) {
                out += createMathPlaceholder(segment.slice(i + 2, end).trim(), true);
                i = end + 2;
                continue;
            }
        }

        if (segment.startsWith('\\(', i) && !isEscaped(segment, i)) {
            const end = findMatchingDelimiter(segment, i + 2, '\\)');
            if (end !== -1) {
                out += createMathPlaceholder(segment.slice(i + 2, end).trim(), false);
                i = end + 2;
                continue;
            }
        }

        if (segment[i] === '$' && !isEscaped(segment, i) && isInlineMathStart(segment, i)) {
            let end = i + 1;
            while (end < segment.length) {
                if (segment[end] === '$' && !isEscaped(segment, end) && isInlineMathEnd(segment, end)) {
                    break;
                }
                end += 1;
            }
            if (end < segment.length) {
                out += createMathPlaceholder(segment.slice(i + 1, end), false);
                i = end + 1;
                continue;
            }
        }

        out += segment[i];
        i += 1;
    }
    return out;
}

function preprocessMarkdownMath(content) {
    const fencePattern = /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g;
    let result = '';
    let lastIndex = 0;

    for (const match of content.matchAll(fencePattern)) {
        const start = match.index + match[1].length;
        result += transformMarkdownMath(content.slice(lastIndex, start));
        result += content.slice(start, start + match[0].length - match[1].length);
        lastIndex = start + match[0].length - match[1].length;
    }

    result += transformMarkdownMath(content.slice(lastIndex));
    return result;
}

function renderMathPlaceholders(container) {
    container.querySelectorAll(`[${MATH_DATA_ATTR}]`).forEach(node => {
        const rawMath = node.getAttribute(MATH_DATA_ATTR);
        if (!rawMath) {
            return;
        }
        const displayMode = node.getAttribute(MATH_DISPLAY_ATTR) === 'true';
        try {
            node.outerHTML = katex.renderToString(decodeMathPayload(rawMath), {
                displayMode,
                throwOnError: false,
                strict: 'ignore',
            });
        } catch (error) {
            LogError(`Failed to render math: ${error?.message || error}`);
            node.textContent = decodeMathPayload(rawMath);
        }
    });
}

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

function hardenAnchorDropHandling(anchor) {
    if (!anchor?.addEventListener) {
        return;
    }

    anchor.draggable = false;
    anchor.setAttribute('draggable', 'false');

    const prevent = event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    };

    anchor.addEventListener('dragenter', prevent, true);
    anchor.addEventListener('dragover', prevent, true);
    anchor.addEventListener('drop', prevent, true);
    anchor.addEventListener('dragstart', prevent, true);
}

function syncEditingPreviewReturnButton() {
    const shouldShow = state.isEditing &&
        !!state.editingSourcePath &&
        !!state.editingPreviewPath &&
        state.editingPreviewPath !== state.editingSourcePath;
    el.editPreviewReturn.classList.toggle('hidden', !shouldShow);
}

// ── Mermaid Configuration ──────────────────────────────────

function getMermaidConfig() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, Arial, sans-serif',
        themeVariables: {
            // 앱의 포인트 컬러(Accent)를 기본 색상으로 적용
            primaryColor: isDark ? '#0a84ff' : '#0071e3',
            primaryTextColor: isDark ? '#ffffff' : '#ffffff',
            primaryBorderColor: isDark ? '#0a84ff' : '#0071e3',
            lineColor: isDark ? '#8e8e93' : '#636366',
            secondaryColor: isDark ? '#1c1c1e' : '#f5f5f7',
            tertiaryColor: isDark ? '#2c2c2e' : '#e5e5ea',
            fontSize: '14px',
        }
    };
}

// 초기 로드시 설정 적용
mermaid.initialize(getMermaidConfig());

// ── Markdown Rendering ─────────────────────────────────────

async function renderMarkdownToHTML(content) {
    const preparedContent = preprocessMarkdownMath(content);
    if (state.currentEngine === "marked") {
        return marked.parse(preparedContent);
    }

    const vf = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkHtml, { sanitize: false })
        .process(preparedContent);
    return String(vf);
}

function clearQueuedEditorPreviewRender() {
    if (editorIdleFullRenderHandle && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(editorIdleFullRenderHandle);
    }
    editorIdleFullRenderHandle = null;
    if (editorIdleFullRenderTimer) {
        clearTimeout(editorIdleFullRenderTimer);
    }
    editorIdleFullRenderTimer = 0;
}

function splitMarkdownIntoBlocks(content) {
    const normalized = String(content || '').replace(/\r\n/g, '\n');
    const blocks = [];
    const separatorRegex = /\n{2,}/g;
    let lastIndex = 0;
    let currentLine = 1;

    const pushBlock = (rawContent, startLine) => {
        const normalizedBlock = rawContent.replace(/\n+$/g, '');
        const blockLineCount = normalizedBlock ? normalizedBlock.split('\n').length : 1;
        blocks.push({
            content: normalizedBlock,
            startLine,
            endLine: startLine + blockLineCount - 1,
        });
    };

    for (const match of normalized.matchAll(separatorRegex)) {
        const segment = normalized.slice(lastIndex, match.index);
        const segmentLineCount = segment ? segment.split('\n').length : 1;
        if (segment.trim()) {
            pushBlock(segment, currentLine);
        }
        currentLine += segmentLineCount + match[0].length;
        lastIndex = match.index + match[0].length;
    }

    const tail = normalized.slice(lastIndex);
    if (tail.trim() || blocks.length === 0) {
        pushBlock(tail, currentLine);
    }

    return blocks;
}

function findBlockIndexForLine(blocks, lineNumber) {
    const safeLine = Math.max(1, lineNumber || 1);
    const index = blocks.findIndex(block => safeLine >= block.startLine && safeLine <= block.endLine);
    return index >= 0 ? index : Math.max(0, blocks.length - 1);
}

async function postProcess(container = el.markdownContainer) {
    container.querySelectorAll('a').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (!href) return;
        hardenAnchorDropHandling(anchor);

        const handleLinkNavigation = event => {
            event.preventDefault();
            event.stopPropagation();

            if (href.startsWith('#')) {
                const { anchor: targetAnchor } = splitLinkTarget(href);
                if (targetAnchor) {
                    state.pendingAnchor = targetAnchor;
                    scrollToAnchor(targetAnchor);
                }
                return;
            }

            if (isExternalURL(href)) {
                import('./main-navigation.js').then(mod => mod.confirmAndOpenExternalLink(href));
                return;
            }

            const wantsNewTab = event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
            if (state.isEditing && !wantsNewTab) {
                previewEditingLinkTarget(href);
                return;
            }
            import('./main-navigation.js').then(mod => mod.resolveLink(href, { newTab: wantsNewTab }));
        };

        anchor.addEventListener('click', handleLinkNavigation);
        anchor.addEventListener('auxclick', event => {
            if (event.button === 1) {
                handleLinkNavigation(event);
            }
        });
    });

    container.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
            const imageBaseFolder = state.isEditing
                ? (state.editingPreviewFolder || state.editingSourceFolder || state.currentFolder)
                : state.currentFolder;
            const abs = joinPath(imageBaseFolder, src);
            ReadImageAsDataURL(abs)
                .then(dataUrl => {
                    if (dataUrl) img.src = dataUrl;
                })
                .catch(err => console.error(`Failed to load image: ${abs}`, err));
        }
    });

    el.markdownContainer.style.fontSize = `${state.currentFontSize}px`;

    await renderMermaidSub(container);
}

async function renderMarkdownBlockPreview(content, cursorLine, token) {
    const blocks = splitMarkdownIntoBlocks(content);
    const focusIndex = findBlockIndexForLine(blocks, cursorLine);
    const shouldRebuild = livePreviewBlocks.length !== blocks.length;

    if (shouldRebuild) {
        const blockMarkup = await Promise.all(blocks.map(async (block, index) => {
            const html = await renderMarkdownToHTML(block.content);
            return `<section class="markdown-live-block" ${LIVE_BLOCK_ATTR}="${index}">${html}</section>`;
        }));
        if (token !== previewRenderToken) {
            return;
        }
        el.markdownContainer.innerHTML = blockMarkup.join('');
        renderMathPlaceholders(el.markdownContainer);
        await postProcess(el.markdownContainer);
        syncEditingPreviewReturnButton();
        livePreviewBlocks = blocks;
        return;
    }

    const targetNode = el.markdownContainer.querySelector(`[${LIVE_BLOCK_ATTR}="${focusIndex}"]`);
    if (!targetNode) {
        await renderMarkdown(content, { token, preserveLiveBlocks: true });
        return;
    }

    const html = await renderMarkdownToHTML(blocks[focusIndex].content);
    if (token !== previewRenderToken) {
        return;
    }
    targetNode.innerHTML = html;
    renderMathPlaceholders(targetNode);
    await postProcess(targetNode);
    syncEditingPreviewReturnButton();
    livePreviewBlocks = blocks;
}

function scheduleIdleFullPreviewRender(content, token) {
    clearQueuedEditorPreviewRender();

    const runFullRender = () => {
        if (token !== previewRenderToken) {
            return;
        }
        renderMarkdown(content, { token }).catch(error => {
            LogError(`Idle full preview render failed: ${error?.message || error}`);
        });
    };

    if (typeof window.requestIdleCallback === 'function') {
        editorIdleFullRenderHandle = window.requestIdleCallback(runFullRender, { timeout: 280 });
        return;
    }

    editorIdleFullRenderTimer = window.setTimeout(runFullRender, 220);
}

export function queueEditorPreviewRender(content, cursorLine, { delay = 100 } = {}) {
    const token = ++previewRenderToken;
    clearTimeout(window._renderTimer);
    window._renderTimer = setTimeout(() => {
        renderMarkdownBlockPreview(content, cursorLine, token).catch(error => {
            LogError(`Block preview render failed: ${error?.message || error}`);
        });
    }, delay);
    scheduleIdleFullPreviewRender(content, token);
}

export async function renderMarkdown(content, options = {}) {
    const {
        token = ++previewRenderToken,
        preserveLiveBlocks = false,
    } = options;

    clearQueuedEditorPreviewRender();
    const html = await renderMarkdownToHTML(content);
    if (token !== previewRenderToken) {
        return;
    }
    el.markdownContainer.innerHTML = html;
    renderMathPlaceholders(el.markdownContainer);
    await postProcess(el.markdownContainer);
    syncEditingPreviewReturnButton();
    if (!preserveLiveBlocks) {
        livePreviewBlocks = [];
    }
}

// ── Recent Files Rendering ─────────────────────────────────

export async function renderRecentFiles() {
    recentFilesCache = await GetRecentFiles();
    if (!recentFilesCache || recentFilesCache.length === 0) {
        el.recentList.classList.add('empty');
        el.recentList.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined empty-state-icon" aria-hidden="true">history</span>
                <div class="empty-state-title">No recent documents yet</div>
                <div class="empty-state-copy">Open a Markdown or HTML file and it will appear here for quick access.</div>
            </div>
        `;
        return;
    }
    el.recentList.classList.remove('empty');
    el.recentList.innerHTML = recentFilesCache.map(f => `
        <div class="recent-item" data-path="${f.path}">
            <span class="recent-name">${f.name}</span>
            <span class="recent-path">${f.path}</span>
        </div>
    `).join('');
}

// ── Active Tab Rendering ───────────────────────────────────

export async function renderActiveTab() {
    const tab = getActiveTab();
    if (!tab) return;

    syncEngineSelector();
    el.currentPath.innerText = formatDisplayPath(state.currentFilePath);

    // Update edit button state
    const isMarkdown = state.currentDocumentType === 'markdown' && 
                       state.currentFilePath !== HOME_SCREEN_PATH && 
                       !isBundledDocumentPath(state.currentFilePath);
    el.btnEdit.disabled = !isMarkdown;

    if (state.isEditing && !isMarkdown) {
        state.isEditing = false;
        state.editorOriginalContent = "";
    }

    const { updateNavButtons } = await import('./main-navigation.js');
    updateNavButtons();

    if (state.currentFilePath === HOME_SCREEN_PATH) {
        await renderHomeScreen();
        return;
    }

    el.homeScreen.classList.add('hidden');
    
    if (state.isEditing) {
        el.editToolbar.classList.remove('hidden');
        el.editorView.classList.remove('hidden');
        el.mainContainer.classList.add('is-editing');
        el.btnEdit.classList.add('active');
        el.contentView.classList.remove('hidden'); 
        el.btnSearchToggle.disabled = true;
        el.selectEngine.disabled = true;
    } else {
        el.editToolbar.classList.add('hidden');
        el.editorView.classList.add('hidden');
        el.mainContainer.classList.remove('is-editing');
        el.btnEdit.classList.remove('active');
        el.btnSearchToggle.disabled = false;
        el.selectEngine.disabled = false;
    }

    getScroller().classList.toggle('html-mode', state.currentDocumentType === 'html');
    if (state.currentDocumentType === 'html') {
        await renderHTMLDocument(state.currentFilePath);
    } else {
        el.htmlFrame.classList.add('hidden');
        el.markdownContainer.classList.remove('hidden');
        if (state.isEditing && !state.editingPreviewPath) {
            state.editingPreviewPath = state.editingSourcePath || state.currentFilePath;
            state.editingPreviewFolder = state.editingSourceFolder || state.currentFolder;
        }
        await renderMarkdown(state.currentMarkdownSource);
    }

    const saved = state.navHistory[state.navIndex]?.scroll ?? 0;
    getScroller().scrollTop = saved;

    if (state.pendingAnchor) {
        scrollToAnchor(state.pendingAnchor);
        state.pendingAnchor = "";
        tab.pendingAnchor = "";
    }

    if (state.currentDocumentType === 'html') {
        clearHighlight();
        return;
    }

    if (state.pendingKeyword) {
        const keyword = state.pendingKeyword;
        state.pendingKeyword = "";
        tab.pendingKeyword = "";
        applyHighlight(keyword);
    } else {
        clearHighlight();
    }
}

async function renderHomeScreen() {
    if (state.isEditing) await exitEditMode(false);
    // 다른 탭에서 편집 중이었을 때 남아있는 에디터 DOM 정리
    el.editToolbar.classList.add('hidden');
    el.editorView.classList.add('hidden');
    el.mainContainer.classList.remove('is-editing');
    el.btnEdit.classList.remove('active');
    el.btnSearchToggle.disabled = false;
    el.selectEngine.disabled = false;
    await renderRecentFiles();
    cleanupHTMLFrame();
    clearHighlight();
    getScroller().classList.remove('html-mode');
    el.markdownContainer.classList.add('hidden');
    el.htmlFrame.classList.add('hidden');
    el.homeScreen.classList.remove('hidden');
    getScroller().scrollTop = state.navHistory[state.navIndex]?.scroll ?? 0;
    syncEditingPreviewReturnButton();

    const { updateNavButtons } = await import('./main-navigation.js');
    updateNavButtons();
}

// ── Post Processing ────────────────────────────────────────

export async function previewEditingLinkTarget(rel) {
    const { pathPart, anchor } = splitLinkTarget(rel);

    if (!pathPart && anchor) {
        scrollToAnchor(anchor);
        return;
    }

    const previewBaseFolder = state.editingPreviewFolder || state.editingSourceFolder || state.currentFolder;
    const normalizedPathPart = normalizeAppLocalFileHref(pathPart) || pathPart;
    const fileURLPath = normalizeFileURLPath(normalizedPathPart);
    const resolvedPath = fileURLPath.startsWith('/') ? fileURLPath : joinPath(previewBaseFolder, fileURLPath);

    if (resolvedPath === state.editingSourcePath) {
        await restoreEditingPreview();
        if (anchor) {
            scrollToAnchor(anchor);
        }
        return;
    }

    let previewContent = "";
    if (isBundledDocumentPath(resolvedPath)) {
        previewContent = await loadBundledMarkdown(resolvedPath);
    } else {
        previewContent = await ReadFile(resolvedPath);
    }

    state.editingPreviewPath = resolvedPath;
    state.editingPreviewFolder = isBundledDocumentPath(resolvedPath) ? "" : getPathDirname(resolvedPath);
    el.markdownContainer.classList.remove('hidden');
    el.htmlFrame.classList.add('hidden');
    await renderMarkdown(previewContent);
    if (anchor) {
        scrollToAnchor(anchor);
    }
}

export async function restoreEditingPreview() {
    if (!state.isEditing) return;
    state.editingPreviewPath = state.editingSourcePath || state.currentFilePath;
    state.editingPreviewFolder = state.editingSourceFolder || state.currentFolder;
    await renderMarkdown(getCurrentEditorText());
}

// ── Mermaid Rendering ──────────────────────────────────────
/**
 * Mermaid 블록을 찾아 렌더링 가능한 div로 변환하고 mermaid 실행
 */
async function renderMermaidSub(container = el.markdownContainer) {
    // 1. 명시적인 mermaid 클래스가 있는 블록과 모든 코드 블록을 탐색
    const codeBlocks = container.querySelectorAll('pre code');
    if (codeBlocks.length === 0) return;

    const mermaidKeywords = [
        'graph', 'flowchart', 'sequenceDiagram', 'gantt', 'classDiagram', 
        'stateDiagram', 'erDiagram', 'journey', 'pie', 'gitGraph', 
        'requirementDiagram', 'mindmap', 'timeline'
    ];

    for (let i = 0; i < codeBlocks.length; i++) {
        const codeBlock = codeBlocks[i];
        const pre = codeBlock.parentElement;
        if (!pre || pre.tagName !== 'PRE') continue;

        const content = codeBlock.textContent.trim();
        if (!content) continue;

        // Mermaid 여부 확인: 클래스명에 포함되어 있거나, 첫 번째 단어가 키워드인 경우
        const hasMermaidClass = codeBlock.className.includes('mermaid') || pre.className.includes('mermaid');
        const firstWord = content.split(/[ \n]/)[0];
        const isMermaidKeyword = mermaidKeywords.includes(firstWord);

        if (hasMermaidClass || isMermaidKeyword) {
            // 고유 ID 생성 (Mermaid 렌더링용)
            const id = `mermaid_graph_${Date.now()}_${i}`;
            
            try {
            // 렌더링 직전 테마를 한 번 더 동기화 (다크 모드 전환 대응)
            mermaid.initialize(getMermaidConfig());

            // 개별 블록을 직접 렌더링하여 SVG 획득
            const { svg } = await mermaid.render(id, content);
                const container = document.createElement('div');
                container.className = 'mermaid-rendered';
                container.innerHTML = svg;
                
                // 기존 pre 블록을 결과 SVG로 교체
                pre.replaceWith(container);
            } catch (err) {
                console.error(`Mermaid render failed [${id}]:`, err);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'mermaid-error';
                errorDiv.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">warning</span> Mermaid Syntax Error`;
                errorDiv.title = err.message;
                pre.appendChild(errorDiv);
            }
        }
    }
}

// ── Anchor Scrolling ───────────────────────────────────────

export function scrollToAnchor(anchor) {
    if (!anchor) return;
    const scope = state.currentDocumentType === 'html'
        ? el.htmlFrame.contentDocument
        : el.markdownContainer;
    const target = scope?.querySelector?.(`#${CSS.escape(anchor)}, a[name="${CSS.escape(anchor)}"]`);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        LogInfo(`anchor not found: ${anchor}`);
    }
}

// ── HTML Frame ─────────────────────────────────────────────

export function cleanupHTMLFrame(options = {}) {
    const { resetSource = false } = options;
    if (htmlFrameResizeObserver) {
        htmlFrameResizeObserver.disconnect();
        htmlFrameResizeObserver = null;
    }
    el.htmlFrame.onload = null;
    if (resetSource) {
        el.htmlFrame.src = 'about:blank';
    }
}

function getLocalFileURL(path) {
    const normalized = path.replace(/\\/g, '/');
    const encodedPath = normalized
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
    return `/localfile/${encodedPath}?t=${Date.now()}`;
}

function resizeHTMLFrame() {
    try {
        const doc = el.htmlFrame.contentDocument;
        if (!doc) return;
        const bodyHeight = doc.body ? doc.body.scrollHeight : 0;
        const rootHeight = doc.documentElement ? doc.documentElement.scrollHeight : 0;
        el.htmlFrame.style.height = `${Math.max(bodyHeight, rootHeight, 720)}px`;
    } catch (error) {
        LogError(`html frame resize failed: ${error?.message || error}`);
    }
}

export function applyHTMLZoom() {
    try {
        const doc = el.htmlFrame.contentDocument;
        if (!doc || state.currentDocumentType !== 'html') {
            return;
        }

        const zoom = Math.max(0.625, state.currentFontSize / 16);
        doc.documentElement.style.zoom = String(zoom);
        if (doc.body) {
            doc.body.style.zoom = String(zoom);
        }
        resizeHTMLFrame();
    } catch (error) {
        LogError(`html zoom failed: ${error?.message || error}`);
    }
}

function wireHTMLDocumentLinks(doc) {
    import('./main-navigation.js').then(mod => mod.bindHistoryMouseNavigation(doc));
    blockNativeFileDrop(doc);
    blockNativeFileDrop(doc.body);
    blockNativeFileDrop(doc.documentElement);

    doc.querySelectorAll('a[href]').forEach(anchor => {
        const rawHref = anchor.getAttribute('href');
        if (!rawHref) return;
        hardenAnchorDropHandling(anchor);

        anchor.addEventListener('click', event => {
            const href = anchor.href || rawHref;

            if (rawHref.startsWith('#')) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (isExternalURL(href)) {
                import('./main-navigation.js').then(mod => mod.confirmAndOpenExternalLink(href));
                return;
            }

            const wantsNewTab = event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
            import('./main-navigation.js').then(mod => mod.resolveLink(href, { newTab: wantsNewTab }));
        });

        anchor.addEventListener('auxclick', event => {
            const href = anchor.href || rawHref;
            if (event.button === 1) {
                event.preventDefault();
                event.stopPropagation();

                if (isExternalURL(href)) {
                    import('./main-navigation.js').then(mod => mod.confirmAndOpenExternalLink(href));
                    return;
                }

                import('./main-navigation.js').then(mod => mod.resolveLink(href, { newTab: true }));
            }
        });
    });
}

async function renderHTMLDocument(path) {
    cleanupHTMLFrame();
    clearHighlight();
    el.markdownContainer.classList.add('hidden');
    el.htmlFrame.classList.remove('hidden');

    await new Promise((resolve, reject) => {
        let settled = false;

        const settle = callback => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(loadTimeout);
            window.clearInterval(readyStatePoll);
            callback();
        };

        const tryResolveFromDocument = () => {
            try {
                const doc = el.htmlFrame.contentDocument;
                if (!doc) {
                    return false;
                }

                const href = el.htmlFrame.contentWindow?.location?.href || "";
                const hasNavigated = href && href !== 'about:blank';
                const hasRenderableRoot = !!(doc.documentElement && (doc.body || doc.documentElement.children.length > 0));
                if (!hasNavigated || !hasRenderableRoot) {
                    return false;
                }

                wireHTMLDocumentLinks(doc);
                applyHTMLZoom();
                resizeHTMLFrame();

                htmlFrameResizeObserver = new ResizeObserver(() => resizeHTMLFrame());
                if (doc.body) htmlFrameResizeObserver.observe(doc.body);
                if (doc.documentElement) htmlFrameResizeObserver.observe(doc.documentElement);
                return true;
            } catch (error) {
                settle(() => reject(error));
                return false;
            }
        };

        const loadTimeout = window.setTimeout(() => {
            if (tryResolveFromDocument()) {
                settle(resolve);
                return;
            }
            const doc = el.htmlFrame.contentDocument;
            if (doc?.documentElement) {
                LogInfo(`html frame timeout fallback path=${path}`);
                settle(resolve);
                return;
            }
            cleanupHTMLFrame({ resetSource: true });
            settle(() => reject(new Error('Timed out while loading the HTML document.')));
        }, 12000);

        const readyStatePoll = window.setInterval(() => {
            if (tryResolveFromDocument()) {
                settle(resolve);
            }
        }, 120);

        el.htmlFrame.onload = () => {
            if (tryResolveFromDocument()) {
                settle(resolve);
            }
        };

        el.htmlFrame.src = getLocalFileURL(path);
    });
}
