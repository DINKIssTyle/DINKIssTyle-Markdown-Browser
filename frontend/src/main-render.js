/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { DEFAULT_CONTENT_FONT_SIZE } from './config.js';
import { marked } from 'marked';
import katex from 'katex';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import mermaid from 'mermaid';
import hljs from './vendor/highlight.js/highlight.common.js';

import {
    state, el, getScroller, HOME_SCREEN_PATH, debounce,
    joinPath, formatDisplayPath, isExternalURL, splitLinkTarget, syncEngineSelector, getPathDirname,
    isBundledDocumentPath, normalizeAppLocalFileHref, normalizeFileURLPath, isActiveMarkdownEditTab,
    decodeLocalMarkdownPath, basename, isImagePath, escapeHTML,
} from './main-state.js';
import { getActiveTab } from './main-tabs.js';
import { exitEditMode, getCurrentEditorText } from './main-editor.js';
import { syncAIControls } from './main-ai.js';
import { applyHighlight, clearHighlight, copyTextToClipboard, showToast } from './main-ui.js';
import { GetRecentFiles, ReadFile, ReadImageAsDataURL, ListFileTree } from '../wailsjs/go/main/App';
import { LogError, LogInfo } from '../wailsjs/runtime/runtime';
import { refreshSidebarContent } from './main-sidebar.js';

// ── Module-level State ─────────────────────────────────────
let recentFilesCache = [];
let htmlFrameResizeObserver = null;
const MATH_DATA_ATTR = 'data-dkst-math';
const MATH_DISPLAY_ATTR = 'data-dkst-math-display';
const LIVE_BLOCK_ATTR = 'data-dkst-live-block-index';
const LIVE_BLOCK_START_LINE_ATTR = 'data-dkst-live-block-start-line';
const LIVE_BLOCK_END_LINE_ATTR = 'data-dkst-live-block-end-line';
const LIVE_LINE_START_ATTR = 'data-dkst-live-line-start';
const LIVE_LINE_END_ATTR = 'data-dkst-live-line-end';
const MARKDOWN_ALERT_TYPES = Object.freeze({
    note: { label: 'Note', icon: 'info' },
    tip: { label: 'Tip', icon: 'lightbulb' },
    important: { label: 'Important', icon: 'priority_high' },
    warning: { label: 'Warning', icon: 'warning' },
    caution: { label: 'Caution', icon: 'report' },
});
let previewRenderToken = 0;
let livePreviewBlocks = [];
let imageViewerZoom = 1;
let imageViewerFit = true;
let activeLinkTooltipAnchor = null;

export function hideLinkTooltip() {
    if (el.linkTooltip) {
        el.linkTooltip.classList.add('hidden');
        el.linkTooltip.textContent = "";
    }

    if (activeLinkTooltipAnchor?._updateTooltipPos) {
        activeLinkTooltipAnchor.removeEventListener('mousemove', activeLinkTooltipAnchor._updateTooltipPos);
        delete activeLinkTooltipAnchor._updateTooltipPos;
    }
    activeLinkTooltipAnchor = null;
}

function captureLivePreviewScrollAnchor() {
    if (!state.isEditing || state.currentEditorRenderMode !== 'realtime') {
        return null;
    }

    const scroller = getScroller();
    const scrollerRect = scroller.getBoundingClientRect();
    const liveBlocks = Array.from(el.markdownContainer.querySelectorAll(`[${LIVE_BLOCK_ATTR}]`));
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const distanceFromBottom = Math.max(0, maxScrollTop - scroller.scrollTop);
    if (liveBlocks.length === 0) {
        return {
            scrollTop: scroller.scrollTop,
            type: 'scroll-top',
            distanceFromBottom,
        };
    }

    const scrollerTop = scrollerRect.top;
    let anchorNode = liveBlocks[0];
    for (const block of liveBlocks) {
        if (block.getBoundingClientRect().top <= scrollerTop + 1) {
            anchorNode = block;
            continue;
        }
        break;
    }

    const anchorIndex = Number(anchorNode.getAttribute(LIVE_BLOCK_ATTR));
    const anchorTop = scroller.scrollTop + (anchorNode.getBoundingClientRect().top - scrollerTop);
    return {
        type: 'live-block',
        index: Number.isFinite(anchorIndex) ? anchorIndex : 0,
        offsetWithinBlock: Math.max(0, scroller.scrollTop - anchorTop),
        scrollTop: scroller.scrollTop,
        distanceFromBottom,
    };
}

function restoreLivePreviewScrollAnchor(snapshot) {
    if (!snapshot) {
        return;
    }

    const scroller = getScroller();
    if (snapshot.type !== 'live-block') {
        scroller.scrollTop = snapshot.scrollTop ?? scroller.scrollTop;
        return;
    }

    const anchorNode = el.markdownContainer.querySelector(`[${LIVE_BLOCK_ATTR}="${snapshot.index}"]`);
    if (!anchorNode) {
        scroller.scrollTop = snapshot.scrollTop ?? scroller.scrollTop;
        return;
    }

    const scrollerTop = scroller.getBoundingClientRect().top;
    const anchorTop = scroller.scrollTop + (anchorNode.getBoundingClientRect().top - scrollerTop);
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const desiredByAnchor = anchorTop + (snapshot.offsetWithinBlock ?? 0);
    const desiredByBottomGap = Math.max(0, maxScrollTop - (snapshot.distanceFromBottom ?? 0));
    const shouldPreferBottomGap = (snapshot.distanceFromBottom ?? Number.POSITIVE_INFINITY) <= 4;
    scroller.scrollTop = shouldPreferBottomGap
        ? desiredByBottomGap
        : Math.min(maxScrollTop, Math.max(0, desiredByAnchor));
}

function getLivePreviewBlockForLine(lineNumber) {
    const targetLine = Math.max(1, Number(lineNumber) || 1);
    const liveBlocks = Array.from(el.markdownContainer.querySelectorAll(`[${LIVE_BLOCK_ATTR}]`));
    if (liveBlocks.length === 0) {
        return null;
    }

    let closestBefore = liveBlocks[0];
    let closestAfter = null;
    for (const block of liveBlocks) {
        const startLine = Number(block.getAttribute(LIVE_BLOCK_START_LINE_ATTR)) || 1;
        const endLine = Number(block.getAttribute(LIVE_BLOCK_END_LINE_ATTR)) || startLine;
        if (targetLine >= startLine && targetLine <= endLine) {
            return { node: block, startLine, endLine, targetLine };
        }
        if (startLine <= targetLine) {
            closestBefore = block;
        }
        if (startLine > targetLine) {
            closestAfter = block;
            break;
        }
    }

    const fallback = closestAfter || closestBefore;
    return {
        node: fallback,
        startLine: Number(fallback.getAttribute(LIVE_BLOCK_START_LINE_ATTR)) || 1,
        endLine: Number(fallback.getAttribute(LIVE_BLOCK_END_LINE_ATTR)) || 1,
        targetLine,
    };
}

function setLiveLineRange(node, startLine, endLine = startLine) {
    if (!node) return;
    node.setAttribute(LIVE_LINE_START_ATTR, String(startLine));
    node.setAttribute(LIVE_LINE_END_ATTR, String(endLine));
}

function hasLiveLineRange(node) {
    return !!node?.hasAttribute?.(LIVE_LINE_START_ATTR);
}

function isFenceStart(line) {
    return /^(\s*)(`{3,}|~{3,})/.test(line);
}

function findFenceEnd(lines, startIndex) {
    const match = lines[startIndex]?.match(/^(\s*)(`{3,}|~{3,})/);
    if (!match) return startIndex;
    const fence = match[2][0];
    const fenceLength = match[2].length;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        const closeMatch = lines[index].match(/^(\s*)(`{3,}|~{3,})\s*$/);
        if (closeMatch && closeMatch[2][0] === fence && closeMatch[2].length >= fenceLength) {
            return index;
        }
    }
    return lines.length - 1;
}

function isTableLine(line) {
    return /\|/.test(line) && !isFenceStart(line);
}

function isBlockStarter(line) {
    return /^#{1,6}\s+/.test(line) ||
        /^-{3,}\s*$/.test(line) ||
        /^_{3,}\s*$/.test(line) ||
        /^\*{3,}\s*$/.test(line) ||
        /^\s*(?:[-*+]\s+|\d+\.\s+)/.test(line) ||
        /^>\s?/.test(line) ||
        isFenceStart(line) ||
        isTableLine(line);
}

function annotateLivePreviewBlockLineAnchors(section, block) {
    if (!section || !block) return;

    const lines = String(block.content || '').split('\n');
    const headings = Array.from(section.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
    const listItems = Array.from(section.querySelectorAll(':scope > ul > li, :scope > ol > li, :scope > li'));
    const horizontalRules = Array.from(section.querySelectorAll(':scope > hr'));
    const codeBlocks = Array.from(section.querySelectorAll(':scope > pre, :scope > .mermaid-rendered'));
    const tables = Array.from(section.querySelectorAll(':scope > table'));
    const blockquotes = Array.from(section.querySelectorAll(':scope > blockquote'));
    const paragraphs = Array.from(section.querySelectorAll(':scope > p'));

    let headingIndex = 0;
    let listItemIndex = 0;
    let hrIndex = 0;
    let codeIndex = 0;
    let tableIndex = 0;
    let blockquoteIndex = 0;
    let paragraphIndex = 0;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }

        const sourceLine = block.startLine + index;
        if (isFenceStart(line)) {
            const endIndex = findFenceEnd(lines, index);
            setLiveLineRange(codeBlocks[codeIndex++], sourceLine, block.startLine + endIndex);
            index = endIndex;
            continue;
        }

        if (/^#{1,6}\s+/.test(line)) {
            setLiveLineRange(headings[headingIndex++], sourceLine);
            continue;
        }

        if (/^-{3,}\s*$/.test(line) || /^_{3,}\s*$/.test(line) || /^\*{3,}\s*$/.test(line)) {
            setLiveLineRange(horizontalRules[hrIndex++], sourceLine);
            continue;
        }

        if (/^\s*(?:[-*+]\s+|\d+\.\s+)/.test(line)) {
            setLiveLineRange(listItems[listItemIndex++], sourceLine);
            continue;
        }

        if (/^>\s?/.test(line)) {
            const startIndex = index;
            while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1])) {
                index += 1;
            }
            setLiveLineRange(blockquotes[blockquoteIndex++], block.startLine + startIndex, block.startLine + index);
            continue;
        }

        if (isTableLine(line)) {
            const startIndex = index;
            while (index + 1 < lines.length && isTableLine(lines[index + 1])) {
                index += 1;
            }
            setLiveLineRange(tables[tableIndex++], block.startLine + startIndex, block.startLine + index);
            continue;
        }

        const startIndex = index;
        while (
            index + 1 < lines.length &&
            lines[index + 1].trim() &&
            !isBlockStarter(lines[index + 1])
        ) {
            index += 1;
        }
        setLiveLineRange(paragraphs[paragraphIndex++], block.startLine + startIndex, block.startLine + index);
    }

    const topLevelNodes = Array.from(section.children).filter(node => !hasLiveLineRange(node));
    const sourceRanges = [];
    for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].trim()) continue;
        const startIndex = index;
        if (isFenceStart(lines[index])) {
            index = findFenceEnd(lines, index);
        } else {
            while (
                index + 1 < lines.length &&
                lines[index + 1].trim() &&
                !isBlockStarter(lines[index + 1])
            ) {
                index += 1;
            }
        }
        sourceRanges.push({
            startLine: block.startLine + startIndex,
            endLine: block.startLine + index,
        });
    }

    topLevelNodes.forEach((node, index) => {
        const range = sourceRanges[index] || sourceRanges[sourceRanges.length - 1];
        if (range) {
            setLiveLineRange(node, range.startLine, range.endLine);
        }
    });
}

function annotateLivePreviewLineAnchors(blocks, container = el.markdownContainer) {
    blocks.forEach((block, index) => {
        const section = container.querySelector(`[${LIVE_BLOCK_ATTR}="${index}"]`);
        annotateLivePreviewBlockLineAnchors(section, block);
    });
}

function getLivePreviewLineTarget(lineNumber, { exact = false } = {}) {
    const targetLine = Math.max(1, Number(lineNumber) || 1);
    const nodes = Array.from(el.markdownContainer.querySelectorAll(`[${LIVE_LINE_START_ATTR}]`));
    if (nodes.length === 0) {
        return null;
    }

    let closestBefore = nodes[0];
    let closestAfter = null;
    for (const node of nodes) {
        const startLine = Number(node.getAttribute(LIVE_LINE_START_ATTR)) || 1;
        const endLine = Number(node.getAttribute(LIVE_LINE_END_ATTR)) || startLine;
        if (targetLine >= startLine && targetLine <= endLine) {
            return node;
        }
        if (startLine <= targetLine) {
            closestBefore = node;
        }
        if (startLine > targetLine) {
            closestAfter = node;
            break;
        }
    }

    if (exact) {
        return null;
    }
    return closestAfter || closestBefore;
}

function setupImageLoadScrollSync(container) {
    const images = container.querySelectorAll('img');
    if (images.length === 0) return;

    const handleImageLoad = debounce(() => {
        if (state.isEditing && isActiveMarkdownEditTab()) {
            import('./main-editor.js').then(mod => {
                mod.triggerImmediateScrollSync();
            });
        }
    }, 100);

    images.forEach(img => {
        if (img.complete) return;
        img.addEventListener('load', handleImageLoad, { once: true });
        img.addEventListener('error', handleImageLoad, { once: true });
    });
}

function buildScrollAnchorMap() {
    const scroller = getScroller();
    const scrollerRect = scroller.getBoundingClientRect();
    const anchors = [];
    const seenLines = new Set();

    const addAnchor = (line, pos) => {
        if (line <= 0 || seenLines.has(line)) return;
        seenLines.add(line);
        anchors.push({ line, pos });
    };

    // 1. Add all live block sections (coarse but very reliable)
    const sections = Array.from(el.markdownContainer.querySelectorAll(`[${LIVE_BLOCK_ATTR}]`));
    for (const section of sections) {
        const startLine = Number(section.getAttribute(LIVE_BLOCK_START_LINE_ATTR));
        const endLine = Number(section.getAttribute(LIVE_BLOCK_END_LINE_ATTR));
        if (isNaN(startLine)) continue;

        const rect = section.getBoundingClientRect();
        addAnchor(startLine, scroller.scrollTop + (rect.top - scrollerRect.top));
        if (endLine > startLine) {
            addAnchor(endLine, scroller.scrollTop + (rect.bottom - scrollerRect.top));
        }
    }

    // 2. Add granular line-level nodes (fine-grained matching)
    const nodes = Array.from(el.markdownContainer.querySelectorAll(`[${LIVE_LINE_START_ATTR}]`));
    for (const node of nodes) {
        const startLine = Number(node.getAttribute(LIVE_LINE_START_ATTR)) || 1;
        const endLine = Number(node.getAttribute(LIVE_LINE_END_ATTR)) || startLine;
        const nodeRect = node.getBoundingClientRect();

        addAnchor(startLine, scroller.scrollTop + (nodeRect.top - scrollerRect.top));
        if (endLine > startLine) {
            addAnchor(endLine, scroller.scrollTop + (nodeRect.bottom - scrollerRect.top));
        }
    }

    anchors.sort((a, b) => a.line - b.line);
    return anchors;
}

function interpolateScrollPosition(anchors, targetLine, totalLines) {
    const scroller = getScroller();
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

    if (anchors.length === 0) {
        const ratio = Math.max(0, (targetLine - 1)) / Math.max(1, totalLines - 1);
        return Math.round(ratio * maxScrollTop);
    }

    // Build full anchor list with boundary anchors
    const fullAnchors = [];
    if (anchors[0].line > 1) {
        fullAnchors.push({ line: 1, pos: 0 });
    }
    fullAnchors.push(...anchors);
    if (fullAnchors[fullAnchors.length - 1].line < totalLines) {
        fullAnchors.push({ line: totalLines, pos: maxScrollTop });
    }

    // Clamp at boundaries
    if (targetLine <= fullAnchors[0].line) {
        return Math.max(0, fullAnchors[0].pos);
    }
    if (targetLine >= fullAnchors[fullAnchors.length - 1].line) {
        return maxScrollTop;
    }

    // Find bracketing pair and interpolate
    for (let i = 0; i < fullAnchors.length - 1; i++) {
        if (fullAnchors[i].line <= targetLine && fullAnchors[i + 1].line >= targetLine) {
            const span = fullAnchors[i + 1].line - fullAnchors[i].line;
            if (span === 0) return fullAnchors[i].pos;
            const t = (targetLine - fullAnchors[i].line) / span;
            const pos = fullAnchors[i].pos + t * (fullAnchors[i + 1].pos - fullAnchors[i].pos);
            return Math.min(maxScrollTop, Math.max(0, pos));
        }
    }

    return Math.min(maxScrollTop, Math.max(0, fullAnchors[fullAnchors.length - 1].pos));
}

function estimateTotalLines() {
    const nodes = Array.from(el.markdownContainer.querySelectorAll(`[${LIVE_LINE_END_ATTR}]`));
    let maxLine = 1;
    for (const node of nodes) {
        const endLine = Number(node.getAttribute(LIVE_LINE_END_ATTR)) || 1;
        if (endLine > maxLine) maxLine = endLine;
    }
    const blockNodes = Array.from(el.markdownContainer.querySelectorAll(`[${LIVE_BLOCK_END_LINE_ATTR}]`));
    for (const node of blockNodes) {
        const endLine = Number(node.getAttribute(LIVE_BLOCK_END_LINE_ATTR)) || 1;
        if (endLine > maxLine) maxLine = endLine;
    }
    return maxLine;
}

export function scrollPreviewToEditorLines(lineNumbers, editorScrollInfo) {
    const candidates = Array.from(new Set((Array.isArray(lineNumbers) ? lineNumbers : [lineNumbers])
        .map(line => Math.max(1, Number(line) || 1))));
    if (candidates.length === 0) {
        return;
    }

    if (!state.isEditing || !isActiveMarkdownEditTab()) {
        return;
    }
    if (state.editingPreviewPath && state.editingSourcePath && state.editingPreviewPath !== state.editingSourcePath) {
        return;
    }

    const scroller = getScroller();
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (maxScrollTop <= 0) {
        return;
    }

    // Edge-snap: if editor is at the very top or very bottom, snap preview accordingly
    if (editorScrollInfo) {
        if (editorScrollInfo.scrollTop <= 0) {
            scroller.scrollTop = 0;
            return;
        }
        if (editorScrollInfo.scrollTop >= editorScrollInfo.maxScrollTop && editorScrollInfo.maxScrollTop > 0) {
            scroller.scrollTop = maxScrollTop;
            return;
        }
    }

    const primaryLine = candidates[0];
    const totalLines = editorScrollInfo?.totalLines || estimateTotalLines();
    const anchors = buildScrollAnchorMap();

    if (anchors.length > 0) {
        scroller.scrollTop = interpolateScrollPosition(anchors, primaryLine, totalLines);
        return;
    }

    // Fallback: use editor scroll ratio
    if (editorScrollInfo && editorScrollInfo.maxScrollTop > 0) {
        const ratio = editorScrollInfo.scrollTop / editorScrollInfo.maxScrollTop;
        scroller.scrollTop = Math.round(ratio * maxScrollTop);
    }
}

export function scrollPreviewToEditorLine(lineNumber) {
    if (!state.isEditing || !isActiveMarkdownEditTab()) {
        return;
    }
    if (state.editingPreviewPath && state.editingSourcePath && state.editingPreviewPath !== state.editingSourcePath) {
        return;
    }

    const targetLine = Math.max(1, Number(lineNumber) || 1);
    const totalLines = estimateTotalLines();
    const anchors = buildScrollAnchorMap();

    if (anchors.length > 0) {
        const scroller = getScroller();
        scroller.scrollTop = interpolateScrollPosition(anchors, targetLine, totalLines);
        return;
    }

    // Fallback to block-level
    const targetNode = getLivePreviewLineTarget(lineNumber) || getLivePreviewBlockForLine(lineNumber)?.node;
    if (!targetNode) {
        return;
    }

    const scroller = getScroller();
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = targetNode.getBoundingClientRect();
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const desiredScrollTop = scroller.scrollTop + (targetRect.top - scrollerRect.top);
    scroller.scrollTop = Math.min(maxScrollTop, Math.max(0, desiredScrollTop));
}

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

function hardenImageDragHandling(img) {
    if (!img?.addEventListener) {
        return;
    }

    img.draggable = false;
    img.setAttribute('draggable', 'false');
    img.style.webkitUserDrag = 'none';

    const prevent = event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'none';
            event.dataTransfer.effectAllowed = 'none';
        }
    };

    img.addEventListener('dragstart', prevent, true);
    img.addEventListener('dragenter', prevent, true);
    img.addEventListener('dragover', prevent, true);
    img.addEventListener('drop', prevent, true);
}

function syncEditingPreviewReturnButton() {
    const shouldShow = state.isEditing &&
        !!state.editingSourcePath &&
        !!state.editingPreviewPath &&
        state.editingPreviewPath !== state.editingSourcePath;
    el.editPreviewReturn.classList.toggle('hidden', !shouldShow);

    const shouldShowOpen = shouldShow && isPreviewInEditingFolder();
    el.editPreviewOpenTab.classList.toggle('hidden', !shouldShowOpen);
}

function normalizeFolderPath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/\/+$/g, '');
}

function isPreviewInEditingFolder() {
    if (!state.editingSourceFolder || !state.editingPreviewPath) {
        return false;
    }
    if (isBundledDocumentPath(state.editingPreviewPath)) {
        return false;
    }

    const sourceFolder = normalizeFolderPath(state.editingSourceFolder);
    const previewFolder = normalizeFolderPath(getPathDirname(state.editingPreviewPath));
    return previewFolder === sourceFolder || previewFolder.startsWith(`${sourceFolder}/`);
}

function removeAlertMarkerFromElement(element, markerLength) {
    let remaining = markerLength;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const emptyTextNodes = [];

    while (remaining > 0) {
        const node = walker.nextNode();
        if (!node) break;

        if (node.nodeValue.length <= remaining) {
            remaining -= node.nodeValue.length;
            node.nodeValue = '';
            emptyTextNodes.push(node);
            continue;
        }

        node.nodeValue = node.nodeValue.slice(remaining).replace(/^\s+/, '');
        remaining = 0;
    }

    emptyTextNodes.forEach(node => node.remove());
}

function enhanceMarkdownAlerts(container) {
    container.querySelectorAll('blockquote').forEach(blockquote => {
        if (blockquote.classList.contains('markdown-alert')) return;

        const firstElement = blockquote.firstElementChild;
        if (!firstElement) return;

        const text = firstElement.textContent || '';
        const match = text.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i);
        if (!match) return;

        const type = match[1].toLowerCase();
        const alertMeta = MARKDOWN_ALERT_TYPES[type];
        if (!alertMeta) return;

        blockquote.classList.add('markdown-alert', `markdown-alert-${type}`);
        removeAlertMarkerFromElement(firstElement, match[0].length);

        if (!firstElement.textContent.trim() && firstElement.childElementCount === 0) {
            firstElement.remove();
        }

        const title = document.createElement('div');
        title.className = 'markdown-alert-title';

        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined markdown-alert-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = alertMeta.icon;

        const label = document.createElement('span');
        label.textContent = alertMeta.label;

        title.append(icon, label);
        blockquote.prepend(title);
    });
}

function enhanceCodeBlockCopyButtons(container) {
    container.querySelectorAll('pre > code').forEach(codeBlock => {
        const pre = codeBlock.parentElement;
        if (!pre || pre.querySelector(':scope > .code-copy-button')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'code-copy-button';
        button.title = 'Copy code';
        button.setAttribute('aria-label', 'Copy code');
        button.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">content_copy</span>';

        button.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();

            try {
                await copyTextToClipboard(codeBlock.textContent || '');
                button.classList.add('is-copied');
                button.title = 'Copied';
                button.setAttribute('aria-label', 'Copied');
                button.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">check</span>';
                showToast('Copied code.', 'content_copy');

                window.setTimeout(() => {
                    button.classList.remove('is-copied');
                    button.title = 'Copy code';
                    button.setAttribute('aria-label', 'Copy code');
                    button.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">content_copy</span>';
                }, 1400);
            } catch (error) {
                LogError(`code block copy failed: ${error?.message || error}`);
                showToast('Failed to copy code.', 'error');
            }
        });

        pre.appendChild(button);
    });
}

function enhanceCodeBlockSyntaxHighlighting(container) {
    container.querySelectorAll('pre > code').forEach(codeBlock => {
        const pre = codeBlock.parentElement;
        if (!pre || pre.classList.contains('mermaid') || codeBlock.classList.contains('mermaid')) return;
        if (codeBlock.dataset.highlighted === 'yes') return;

        try {
            hljs.highlightElement(codeBlock);
        } catch (error) {
            LogError(`code block highlight failed: ${error?.message || error}`);
        }
    });
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
            fontSize: `${DEFAULT_CONTENT_FONT_SIZE}px`,
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

function splitMarkdownIntoBlocks(content) {
    const normalized = String(content || '').replace(/\r\n/g, '\n');
    const blocks = [];
    const lines = normalized.split('\n');
    let blockLines = [];
    let blockStartLine = 1;
    let activeFence = null;

    const getFence = line => {
        const match = line.match(/^(\s*)(`{3,}|~{3,})/);
        if (!match) return null;
        return { marker: match[2][0], length: match[2].length };
    };

    const isFenceClose = (line, fence) => {
        if (!fence) return false;
        const match = line.match(/^(\s*)(`{3,}|~{3,})\s*$/);
        return !!match && match[2][0] === fence.marker && match[2].length >= fence.length;
    };

    const pushBlock = (rawContent, startLine, allowEmpty = false) => {
        const normalizedBlock = rawContent.replace(/\n+$/g, '');
        if (!allowEmpty && !normalizedBlock.trim()) return;
        const blockLineCount = normalizedBlock ? normalizedBlock.split('\n').length : 1;
        blocks.push({
            content: normalizedBlock,
            startLine,
            endLine: startLine + blockLineCount - 1,
        });
    };

    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        if (blockLines.length === 0) {
            if (!line.trim()) return;
            blockStartLine = lineNumber;
        }

        blockLines.push(line);

        if (activeFence) {
            if (isFenceClose(line, activeFence)) {
                activeFence = null;
            }
            return;
        }

        const fence = getFence(line);
        if (fence) {
            activeFence = fence;
            return;
        }

        if (!line.trim()) {
            pushBlock(blockLines.join('\n'), blockStartLine);
            blockLines = [];
        }
    });

    if (blockLines.length > 0 || blocks.length === 0) {
        pushBlock(blockLines.join('\n'), blockStartLine, blocks.length === 0);
    }

    return blocks;
}

async function postProcess(container = el.markdownContainer) {
    enhanceMarkdownAlerts(container);

    container.querySelectorAll('a').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (!href) return;
        hardenAnchorDropHandling(anchor);

        const handleLinkNavigation = event => {
            hideLinkTooltip();
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

        const handleMouseEnter = (event) => {
            if (!el.linkTooltip) return;
            hideLinkTooltip();
            activeLinkTooltipAnchor = anchor;
            el.linkTooltip.textContent = decodeLocalMarkdownPath(href);
            el.linkTooltip.classList.remove('hidden');

            const updatePosition = (e) => {
                const padding = 16;
                let x = e.clientX + 15;
                let y = e.clientY + 15;

                const rect = el.linkTooltip.getBoundingClientRect();
                if (x + rect.width > window.innerWidth - padding) {
                    x = e.clientX - rect.width - 5;
                }
                if (y + rect.height > window.innerHeight - padding) {
                    y = e.clientY - rect.height - 5;
                }

                el.linkTooltip.style.left = `${x}px`;
                el.linkTooltip.style.top = `${y}px`;
            };

            updatePosition(event);
            anchor.addEventListener('mousemove', updatePosition);
            anchor._updateTooltipPos = updatePosition;
        };

        const handleMouseLeave = () => {
            hideLinkTooltip();
        };

        anchor.addEventListener('click', handleLinkNavigation);
        anchor.addEventListener('mouseenter', handleMouseEnter);
        anchor.addEventListener('mouseleave', handleMouseLeave);
        anchor.addEventListener('auxclick', event => {
            if (event.button === 1) {
                handleLinkNavigation(event);
            }
        });
    });

    container.querySelectorAll('img').forEach(img => {
        hardenImageDragHandling(img);

        const src = img.getAttribute('src');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
            const imageSrc = decodeLocalMarkdownPath(src);
            const imageBaseFolder = state.isEditing
                ? (state.editingPreviewFolder || state.editingSourceFolder || state.currentFolder)
                : state.currentFolder;
            const abs = joinPath(imageBaseFolder, imageSrc);
            ReadImageAsDataURL(abs)
                .then(dataUrl => {
                    if (dataUrl) img.src = dataUrl;
                })
                .catch(err => console.error(`Failed to load image: ${abs}`, err));
        }
    });

    el.markdownContainer.style.fontSize = `${state.currentFontSize}px`;

    await renderMermaidSub(container);
    enhanceCodeBlockSyntaxHighlighting(container);
    enhanceCodeBlockCopyButtons(container);
}

async function renderMarkdownLiveBlocks(content, token) {
    const blocks = splitMarkdownIntoBlocks(content);
    const blockMarkup = await Promise.all(blocks.map(async (block, index) => {
        const html = await renderMarkdownToHTML(block.content);
        return `<section class="markdown-live-block" ${LIVE_BLOCK_ATTR}="${index}" ${LIVE_BLOCK_START_LINE_ATTR}="${block.startLine}" ${LIVE_BLOCK_END_LINE_ATTR}="${block.endLine}">${html}</section>`;
    }));
    if (token !== previewRenderToken) {
        return null;
    }

    const scrollAnchor = captureLivePreviewScrollAnchor();
    el.markdownContainer.innerHTML = blockMarkup.join('');
    renderMathPlaceholders(el.markdownContainer);
    await postProcess(el.markdownContainer);
    setupImageLoadScrollSync(el.markdownContainer);
    annotateLivePreviewLineAnchors(blocks, el.markdownContainer);
    restoreLivePreviewScrollAnchor(scrollAnchor);
    syncEditingPreviewReturnButton();
    livePreviewBlocks = blocks;
    refreshSidebarContent();
    return blocks;
}

async function updateChangedLivePreviewBlocks(content, token) {
    const blocks = splitMarkdownIntoBlocks(content);
    const shouldRebuild = livePreviewBlocks.length !== blocks.length ||
        el.markdownContainer.querySelectorAll(`[${LIVE_BLOCK_ATTR}]`).length !== blocks.length;

    if (shouldRebuild) {
        await renderMarkdownLiveBlocks(content, token);
        return;
    }

    const changedIndexes = [];
    for (let index = 0; index < blocks.length; index += 1) {
        if (blocks[index].content !== livePreviewBlocks[index]?.content) {
            changedIndexes.push(index);
        }
    }

    if (changedIndexes.length === 0) {
        livePreviewBlocks = blocks;
        return;
    }

    if (token !== previewRenderToken) {
        return;
    }

    const scrollAnchor = captureLivePreviewScrollAnchor();

    const renderedBlocks = await Promise.all(changedIndexes.map(async index => ({
        index,
        html: await renderMarkdownToHTML(blocks[index].content),
    })));
    if (token !== previewRenderToken) {
        return;
    }

    for (const { index, html } of renderedBlocks) {
        const targetNode = el.markdownContainer.querySelector(`[${LIVE_BLOCK_ATTR}="${index}"]`);
        if (!targetNode) {
            await renderMarkdownLiveBlocks(content, token);
            return;
        }
        targetNode.innerHTML = html;
        renderMathPlaceholders(targetNode);
        await postProcess(targetNode);
        setupImageLoadScrollSync(targetNode);
        annotateLivePreviewBlockLineAnchors(targetNode, blocks[index]);
    }

    restoreLivePreviewScrollAnchor(scrollAnchor);
    syncEditingPreviewReturnButton();
    livePreviewBlocks = blocks;
    refreshSidebarContent();
}

export function queueEditorPreviewRender(content, editorTopLine, { delay = 100, syncScroll = true } = {}) {
    const token = ++previewRenderToken;
    clearTimeout(window._renderTimer);
    window._renderTimer = setTimeout(() => {
        updateChangedLivePreviewBlocks(content, token)
            .then(() => {
                if (syncScroll) {
                    scrollPreviewToEditorLine(editorTopLine);
                }
            })
            .catch(error => {
                LogError(`Block preview render failed: ${error?.message || error}`);
            });
    }, delay);
}

export async function renderMarkdown(content, options = {}) {
    const {
        token = ++previewRenderToken,
        preserveLiveBlocks = false,
    } = options;

    if (state.isEditing && !preserveLiveBlocks) {
        await renderMarkdownLiveBlocks(content, token);
        return;
    }

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
    refreshSidebarContent();
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

    hideLinkTooltip();
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
        syncAIControls();
        el.editorView.classList.remove('hidden');
        el.mainContainer.classList.add('is-editing');
        el.btnEdit.classList.add('active');
        el.contentView.classList.remove('hidden');
        el.selectEngine.disabled = true;
    } else {
        el.editToolbar.classList.add('hidden');
        syncAIControls();
        el.editorView.classList.add('hidden');
        el.mainContainer.classList.remove('is-editing');
        el.btnEdit.classList.remove('active');
        el.selectEngine.disabled = state.currentDocumentType !== 'markdown';
    }

    getScroller().classList.toggle('html-mode', state.currentDocumentType === 'html');
    getScroller().classList.toggle('image-mode', state.currentDocumentType === 'image');
    if (state.currentDocumentType === 'html') {
        await renderHTMLDocument(state.currentFilePath);
    } else if (state.currentDocumentType === 'image') {
        await renderImageDocument(state.currentFilePath);
    } else if (state.currentDocumentType === 'unsupported') {
        renderUnsupportedDocument(state.currentFilePath);
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

    if (state.currentDocumentType === 'image' || state.currentDocumentType === 'unsupported') {
        clearHighlight();
        refreshSidebarContent();
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

    // Update sidebar content (e.g., Markdown Outline)
    refreshSidebarContent();
}

async function renderHomeScreen() {
    if (state.isEditing) await exitEditMode(false);
    // 다른 탭에서 편집 중이었을 때 남아있는 에디터 DOM 정리
    el.editToolbar.classList.add('hidden');
    el.editorView.classList.add('hidden');
    el.mainContainer.classList.remove('is-editing');
    el.btnEdit.classList.remove('active');
    el.selectEngine.disabled = false;
    await renderRecentFiles();
    cleanupHTMLFrame();
    clearHighlight();
    getScroller().classList.remove('html-mode');
    el.markdownContainer.classList.add('hidden');
    el.htmlFrame.classList.add('hidden');
    el.homeScreen.classList.remove('hidden');
    getScroller().scrollTop = state.navHistory[state.navIndex]?.scroll ?? 0;
    getScroller().classList.remove('image-mode');
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

export async function openEditingPreviewInNewTab() {
    if (!state.isEditing || !state.editingPreviewPath || !isPreviewInEditingFolder()) {
        return;
    }

    const path = state.editingPreviewPath;
    const { openPath } = await import('./main-navigation.js');
    await openPath(path, { newTab: true, pushHistory: true, setHome: true });
}

async function renderImageDocument(path) {
    cleanupHTMLFrame({ resetSource: true });
    clearHighlight();
    el.homeScreen.classList.add('hidden');
    el.htmlFrame.classList.add('hidden');
    el.markdownContainer.classList.remove('hidden');

    const imageSrc = await ReadImageAsDataURL(path);
    const imageName = basename(path);
    el.markdownContainer.innerHTML = `
        <div class="image-viewer-shell">
            <div class="image-viewer-stage">
                <div class="image-viewer-canvas">
                    <img id="image-viewer-img" class="image-viewer-img is-fit" alt="${escapeHTML(imageName)}" src="${imageSrc}">
                </div>
            </div>
            <div class="image-viewer-hud" role="toolbar" aria-label="Image viewer controls">
                <button type="button" class="image-hud-btn" data-image-action="prev" title="Previous Image" aria-label="Previous Image">
                    <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
                </button>
                <button type="button" class="image-hud-btn" data-image-action="next" title="Next Image" aria-label="Next Image">
                    <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
                </button>
                <span class="image-hud-divider" aria-hidden="true"></span>
                <button type="button" class="image-hud-btn" data-image-action="zoom-out" title="Zoom Out" aria-label="Zoom Out">
                    <span class="material-symbols-outlined" aria-hidden="true">zoom_out</span>
                </button>
                <button type="button" class="image-hud-btn" data-image-action="zoom-in" title="Zoom In" aria-label="Zoom In">
                    <span class="material-symbols-outlined" aria-hidden="true">zoom_in</span>
                </button>
                <button type="button" class="image-hud-btn" data-image-action="fit" title="Fit to Screen" aria-label="Fit to Screen">
                    <span class="material-symbols-outlined" aria-hidden="true">fit_screen</span>
                </button>
            </div>
        </div>
    `;
    imageViewerZoom = 1;
    imageViewerFit = true;
    bindImageViewerControls(path);
}

function bindImageViewerControls(path) {
    const img = el.markdownContainer.querySelector('#image-viewer-img');
    if (!img) {
        return;
    }

    el.markdownContainer.querySelectorAll('[data-image-action]').forEach(button => {
        button.addEventListener('click', async () => {
            const action = button.dataset.imageAction;
            if (action === 'zoom-out') {
                imageViewerFit = false;
                if (!img.complete || !img.naturalWidth) {
                    await img.decode?.().catch(() => { });
                }
                if (imageViewerZoom === 1 && img.classList.contains('is-fit')) {
                    imageViewerZoom = getImageViewerFitScale(img);
                }
                imageViewerZoom = Math.max(0.1, imageViewerZoom - 0.1);
                applyImageViewerZoom(img);
                return;
            }
            if (action === 'zoom-in') {
                imageViewerFit = false;
                if (!img.complete || !img.naturalWidth) {
                    await img.decode?.().catch(() => { });
                }
                if (imageViewerZoom === 1 && img.classList.contains('is-fit')) {
                    imageViewerZoom = getImageViewerFitScale(img);
                }
                imageViewerZoom = Math.min(8, imageViewerZoom + 0.1);
                applyImageViewerZoom(img);
                return;
            }
            if (action === 'fit') {
                imageViewerFit = true;
                imageViewerZoom = 1;
                applyImageViewerZoom(img);
                return;
            }
            if (action === 'prev' || action === 'next') {
                const nextPath = await getAdjacentImagePath(path, action === 'next' ? 1 : -1);
                if (nextPath) {
                    const { openPath } = await import('./main-navigation.js');
                    await openPath(nextPath, { pushHistory: true, setHome: false });
                }
            }
        });
    });
}

function applyImageViewerZoom(img) {
    img.classList.toggle('is-fit', imageViewerFit);
    if (imageViewerFit) {
        img.style.width = '';
        img.style.height = '';
        return;
    }
    img.style.width = `${Math.max(1, img.naturalWidth * imageViewerZoom)}px`;
    img.style.height = 'auto';
}

function getImageViewerFitScale(img) {
    const stage = img.closest('.image-viewer-stage');
    const naturalWidth = img.naturalWidth || 1;
    const naturalHeight = img.naturalHeight || 1;
    const availableWidth = Math.max(1, (stage?.clientWidth || 1) - 48);
    const availableHeight = Math.max(1, (stage?.clientHeight || 1) - 120);
    return Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
}

async function getAdjacentImagePath(path, direction) {
    try {
        const tree = await ListFileTree(getPathDirname(path));
        const images = (tree.children || [])
            .filter(item => !item.isDir && isImagePath(item.path))
            .map(item => item.path)
            .sort((a, b) => basename(a).localeCompare(basename(b), undefined, { sensitivity: 'base' }));
        if (images.length === 0) {
            return "";
        }
        const currentIndex = images.findIndex(item => item === path);
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        return images[(safeIndex + direction + images.length) % images.length];
    } catch (error) {
        LogError(`getAdjacentImagePath failed path=${path}: ${error?.message || error}`);
        return "";
    }
}

function renderUnsupportedDocument(path) {
    cleanupHTMLFrame({ resetSource: true });
    clearHighlight();
    el.homeScreen.classList.add('hidden');
    el.htmlFrame.classList.add('hidden');
    el.markdownContainer.classList.remove('hidden');
    el.markdownContainer.innerHTML = `
        <div class="unsupported-preview">
            <span class="material-symbols-outlined unsupported-preview-icon" aria-hidden="true">draft</span>
            <div class="unsupported-preview-name">${escapeHTML(basename(path))}</div>
            <div class="unsupported-preview-message">Unsupported File Type</div>
        </div>
    `;
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

        const zoom = Math.max(0.625, state.currentFontSize / DEFAULT_CONTENT_FONT_SIZE);
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
