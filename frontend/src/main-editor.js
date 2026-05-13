/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { DEFAULT_CONTENT_FONT_SIZE, EDITOR_FONT_VISUAL_SCALE } from './config.js';
import { state, el, getPathDirname, basename, formatSaveDialogMessage, debounce } from './main-state.js';
import { updateNavButtons, openPath } from './main-navigation.js';
import { getActiveTab } from './main-tabs.js';
import { renderActiveTab, renderMarkdown, queueEditorPreviewRender, scrollPreviewToEditorLine, scrollPreviewToEditorLines, hideLinkTooltip } from './main-render.js';
import { showToast } from './main-ui.js';
import { persistAppSettings } from './main-settings.js';
import { SaveFile, AskConfirm, SelectDocument, SelectImage, GetRelativePath, ShowSaveFileDialog, SyncEditorState } from '../wailsjs/go/main/App';
import { LogError } from '../wailsjs/runtime/runtime';

import { EditorState, Compartment, Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder, drawSelection, dropCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { SearchCursor } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { oneDark } from '@codemirror/theme-one-dark';
import { ghostTextField, showAskAIPrompt, showPromptBoxAtSelection, syncAIControls } from './main-ai.js';

// ── Module-level State ─────────────────────────────────────
let slashMenuState = null;
let slashMenuEventsBound = false;
let lastPreviewCursorLine = 1;
let lastPreviewTopLine = 1;
let findMatches = [];
let currentMatchIndex = -1;
let isFindBarOpen = false;
let previewScrollSyncFrame = 0;
let editorScrollEventsBound = false;
let lastRenderedPreviewContent = "";
export let cmView = null;
export const themeCompartment = new Compartment();
export const tokenColorCompartment = new Compartment();

export const EDITOR_TOKEN_COLOR_FIELDS = Object.freeze([
    { key: 'plain', label: 'Plain Text' },
    { key: 'heading', label: 'Headings' },
    { key: 'emphasis', label: 'Emphasis' },
    { key: 'link', label: 'Links' },
    { key: 'quote', label: 'Blockquotes' },
    { key: 'code', label: 'Inline Code' },
    { key: 'codeBg', label: 'Code Background' },
    { key: 'marker', label: 'Markers' },
    { key: 'htmlTag', label: 'HTML Tags' },
    { key: 'attribute', label: 'Attributes' },
    { key: 'string', label: 'Strings' },
    { key: 'keyword', label: 'Keywords' },
    { key: 'comment', label: 'Comments' },
    { key: 'invalid', label: 'Invalid' },
]);

const EDITOR_BACKGROUND_DEFAULTS = Object.freeze({
    light: '#ffffff',
    dark: '#1f2937',
});

const EDITOR_TOKEN_COLOR_DEFAULTS = Object.freeze({
    light: Object.freeze({
        plain: '#1f2937',
        heading: '#1f2937',
        emphasis: '#375d99',
        link: '#0071e3',
        quote: '#5b6f8f',
        code: '#d14',
        codeBg: '#dfe3eaff',
        marker: '#0071e3',
        htmlTag: '#0a7f8f',
        attribute: '#8f5f00',
        string: '#0f7b32',
        keyword: '#8a3ffc',
        comment: '#6b7280',
        invalid: '#d92d20',
    }),
    dark: Object.freeze({
        plain: '#e5e7eb',
        heading: '#e5e7eb',
        emphasis: '#c8d8ff',
        link: '#7db7ff',
        quote: '#9ab3d5',
        code: '#ff8aa1',
        codeBg: 'rgba(255, 255, 255, 0.1)',
        marker: '#7db7ff',
        htmlTag: '#6ee7f2',
        attribute: '#ffd166',
        string: '#8ee6a1',
        keyword: '#d8b4fe',
        comment: '#9ca3af',
        invalid: '#fda29b',
    }),
});

export const EDITOR_TOKEN_COLOR_PRESETS = Object.freeze([
    {
        key: 'default',
        label: 'Default',
        colors: null,
        background: null,
    },
    {
        key: 'seoul',
        label: 'Seoul',
        background: '#fcfcfc',
        colors: Object.freeze({
            plain: '#404040',
            heading: '#618138',
            emphasis: '#f294da',
            link: '#2d4285',
            quote: '#e36d3e',
            code: '#9c4025',
            codeBg: '#f7dda7',
            marker: '#59555e',
            htmlTag: '#cb5b30',
            attribute: '#a41b4a',
            string: '#a83a0a',
            keyword: '#639f2d',
            comment: '#548560',
            invalid: '#c7445c',
        }),
    },
    {
        key: 'jeonju',
        label: 'Jeonju',
        background: '#e0e7e8',
        colors: Object.freeze({
            plain: '#642242',
            heading: '#a83449',
            emphasis: '#595384',
            link: '#306bb2',
            quote: '#cb5899',
            code: '#6c407c',
            codeBg: '#eacecd',
            marker: '#0b773a',
            htmlTag: '#5e2a65',
            attribute: '#b33373',
            string: '#817209',
            keyword: '#9f48ac',
            comment: '#675ca3',
            invalid: '#ae2d40',
        }),
    },
    {
        key: 'gyeongju',
        label: 'Gyeongju',
        background: '#181625',
        colors: Object.freeze({
            plain: '#d89f9d',
            heading: '#c93c8c',
            emphasis: '#cce1ed',
            link: '#98b2a8',
            quote: '#c6b097',
            code: '#ab9ac4',
            codeBg: '#3d3d3d',
            marker: '#aa6054',
            htmlTag: '#9d838a',
            attribute: '#bbadab',
            string: '#db739b',
            keyword: '#d2894b',
            comment: '#7f9cb2',
            invalid: '#9080b9',
        }),
    },
    {
        key: 'night',
        label: 'Night',
        background: '#1a1b26',
        colors: Object.freeze({
            plain: '#c0caf5',
            heading: '#c0caf5',
            emphasis: '#7aa2f7',
            link: '#7dcfff',
            quote: '#6b718cff',
            code: '#f7768e',
            codeBg: 'rgba(41, 46, 66, 0.6)',
            marker: '#7aa2f7',
            htmlTag: '#2ac3de',
            attribute: '#e0af68',
            string: '#9ece6a',
            keyword: '#bb9af7',
            comment: '#565f89',
            invalid: '#f7768e',
        }),
    },
    {
        key: 'nord',
        label: 'Nord',
        background: '#2e3440',
        colors: Object.freeze({
            plain: '#d8dee9',
            heading: '#eceff4',
            emphasis: '#81a1c1',
            link: '#88c0d0',
            quote: '#a5a5a5',
            code: '#d08770',
            codeBg: 'rgba(76, 86, 106, 0.4)',
            marker: '#5e81ac',
            htmlTag: '#8fbcbb',
            attribute: '#ebcb8b',
            string: '#a3be8c',
            keyword: '#b48ead',
            comment: '#bfbfbf',
            invalid: '#bf616a',
        }),
    },
    {
        key: 'catppuccin',
        label: 'Catppuccin',
        background: '#1e1e2e',
        colors: Object.freeze({
            plain: '#cdd6f4',
            heading: '#cdd6f4',
            emphasis: '#cba6f7',
            link: '#89b4fa',
            quote: '#b8b8b8',
            code: '#f5c2e7',
            codeBg: 'rgba(49, 50, 68, 0.6)',
            marker: '#89b4fa',
            htmlTag: '#94e2d5',
            attribute: '#f9e2af',
            string: '#a6e3a1',
            keyword: '#cba6f7',
            comment: '#7f849c',
            invalid: '#f38ba8',
        }),
    },
    {
        key: 'one-dark-pro',
        label: 'One Dark Pro',
        background: '#282c34',
        colors: Object.freeze({
            plain: '#bebebe',
            heading: '#abb2bf',
            emphasis: '#61afef',
            link: '#56b6c2',
            quote: '#a7a7a7',
            code: '#e06c75',
            codeBg: 'rgba(85, 85, 85, 0.7)',
            marker: '#61afef',
            htmlTag: '#e06c75',
            attribute: '#d19a66',
            string: '#98c379',
            keyword: '#c678dd',
            comment: '#d2d2d2',
            invalid: '#e06c75',
        }),
    },
    {
        key: 'solarized-light',
        label: 'Solarized',
        background: '#fdf6e3',
        colors: Object.freeze({
            plain: '#657b83',
            heading: '#586e75',
            emphasis: '#268bd2',
            link: '#2aa198',
            quote: '#686868',
            code: '#d33682',
            codeBg: 'rgba(238, 232, 213, 0.6)',
            marker: '#268bd2',
            htmlTag: '#2aa198',
            attribute: '#b58900',
            string: '#859900',
            keyword: '#6c71c4',
            comment: '#6e6e6e',
            invalid: '#dc322f',
        }),
    },
]);

const HTML_VOID_TAGS = [
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
];
const HTML_VOID_TAG_CLOSE_REGEX = new RegExp(`(<(${HTML_VOID_TAGS.join('|')})\\b[^<>]*?>)<\\/\\2\\s*>`, 'gi');
function getEditorThemeName() {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function getEditorDefaultTokenColors(themeName = getEditorThemeName()) {
    return { ...(EDITOR_TOKEN_COLOR_DEFAULTS[themeName] || EDITOR_TOKEN_COLOR_DEFAULTS.light) };
}

export function getEditorDefaultBackgroundColor(themeName = getEditorThemeName()) {
    return EDITOR_BACKGROUND_DEFAULTS[themeName] || EDITOR_BACKGROUND_DEFAULTS.light;
}

function normalizeTokenColors(colors = {}, themeName = getEditorThemeName()) {
    const defaults = getEditorDefaultTokenColors(themeName);
    return Object.fromEntries(
        EDITOR_TOKEN_COLOR_FIELDS.map(({ key }) => [key, isValidHexColor(colors[key]) ? colors[key] : defaults[key]])
    );
}

function normalizeBackgroundColor(color, themeName = getEditorThemeName()) {
    return isValidHexColor(color) ? color : getEditorDefaultBackgroundColor(themeName);
}

function isValidHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function hexToRgb(hex) {
    const normalized = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
}

function getRelativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 1;
    const channel = value => {
        const normalized = value / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function buildEditorMarkdownHighlight(colors) {
    return HighlightStyle.define([
        { tag: tags.heading1, color: colors.heading, fontSize: '1.5em', fontWeight: '800' },
        { tag: tags.heading2, color: colors.heading, fontSize: '1.35em', fontWeight: '800' },
        { tag: tags.heading3, color: colors.heading, fontSize: '1.22em', fontWeight: '760' },
        { tag: tags.heading4, color: colors.heading, fontSize: '1.12em', fontWeight: '740' },
        { tag: tags.heading5, color: colors.heading, fontSize: '1.06em', fontWeight: '720' },
        { tag: tags.heading6, color: colors.heading, fontSize: '1.02em', fontWeight: '700' },
        { tag: tags.strong, color: colors.heading, fontWeight: '800' },
        { tag: tags.emphasis, color: colors.emphasis, fontStyle: 'italic' },
        { tag: tags.strikethrough, color: colors.comment, textDecoration: 'line-through' },
        { tag: tags.link, color: colors.link, textDecoration: 'underline', textUnderlineOffset: '2px' },
        { tag: tags.url, color: colors.link },
        { tag: tags.quote, color: colors.quote, fontStyle: 'italic' },
        { tag: tags.monospace, color: colors.code, backgroundColor: colors.codeBg },
        { tag: tags.contentSeparator, color: colors.comment, fontWeight: '700' },
        { tag: tags.list, color: colors.marker, fontWeight: '700' },
        { tag: tags.meta, color: colors.comment },
        { tag: tags.processingInstruction, color: colors.marker, fontWeight: '700' },
        { tag: tags.tagName, color: colors.htmlTag, fontWeight: '700' },
        { tag: tags.angleBracket, color: colors.comment },
        { tag: tags.attributeName, color: colors.attribute },
        { tag: tags.attributeValue, color: colors.string },
        { tag: tags.string, color: colors.string },
        { tag: tags.keyword, color: colors.keyword, fontWeight: '700' },
        { tag: tags.atom, color: colors.attribute },
        { tag: tags.bool, color: colors.attribute, fontWeight: '700' },
        { tag: tags.comment, color: colors.comment, fontStyle: 'italic' },
        { tag: tags.escape, color: colors.invalid, fontWeight: '700' },
        { tag: tags.invalid, color: colors.invalid, textDecoration: `underline wavy ${colors.invalid}` },
    ]);
}

function getTokenColorExtension() {
    if (!state.editorTokenColorsEnabled) {
        return [];
    }
    return syntaxHighlighting(buildEditorMarkdownHighlight(state.editorTokenColors));
}

function applyEditorPlainTextColor() {
    const plainTextColor = state.editorTokenColors?.plain || getEditorDefaultTokenColors().plain;
    el.editorView?.style.setProperty('--editor-plain-text-color', plainTextColor);
}

export function applyEditorPreferencesFromSettings(settings = {}) {
    state.editorPreviewScrollSyncEnabled = settings.editorPreviewScrollSync !== false;
    state.editorTokenColorsEnabled = settings.editorTokenColorsEnabled !== false;
    state.editorTokenColors = normalizeTokenColors(settings.editorTokenColors || {});
    state.editorBackgroundColor = normalizeBackgroundColor(settings.editorBackgroundColor);
    applyEditorTokenColors();
    applyEditorBackgroundColor();
}

export function applyEditorTokenColors() {
    state.editorTokenColors = normalizeTokenColors(state.editorTokenColors);
    applyEditorPlainTextColor();
    if (cmView) {
        cmView.dispatch({
            effects: tokenColorCompartment.reconfigure(getTokenColorExtension())
        });
    }
}

export function applyEditorBackgroundColor() {
    state.editorBackgroundColor = normalizeBackgroundColor(state.editorBackgroundColor);
    el.editorView?.style.setProperty('--editor-background-color', state.editorBackgroundColor);
    applyEditorPlainTextColor();
    const isDarkBackground = getRelativeLuminance(state.editorBackgroundColor) < 0.45;
    el.editorView?.style.setProperty(
        '--editor-gutter-background-color',
        isDarkBackground
            ? 'color-mix(in srgb, var(--editor-background-color) 88%, black 12%)'
            : 'color-mix(in srgb, var(--editor-background-color) 88%, white 12%)'
    );
    el.editorView?.style.setProperty(
        '--editor-gutter-text-color',
        isDarkBackground ? 'rgba(226, 232, 240, 0.62)' : 'rgba(31, 41, 55, 0.62)'
    );
    el.editorView?.style.setProperty(
        '--editor-gutter-border-color',
        isDarkBackground ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
    );
}

function applyEditorFontSize() {
    if (!cmView) return;
    cmView.contentDOM.style.fontSize = `${state.currentFontSize * EDITOR_FONT_VISUAL_SCALE}px`;
}

export function getCurrentEditorText() {
    if (cmView) {
        return cmView.state.doc.toString();
    }
    return state.currentMarkdownSource || "";
}

export function isEditorFocused() {
    if (!cmView?.contentDOM) return false;
    const activeElement = document.activeElement;
    return activeElement === cmView.contentDOM || cmView.contentDOM.contains(activeElement);
}

export function changeEditorFontSize(delta) {
    if (!cmView) return false;
    state.currentFontSize = Math.min(72, Math.max(8, state.currentFontSize + delta));
    applyEditorFontSize();
    void persistEditorPreferences();
    return true;
}

export function resetEditorFontSize() {
    if (!cmView) return false;
    state.currentFontSize = DEFAULT_CONTENT_FONT_SIZE;
    applyEditorFontSize();
    void persistEditorPreferences();
    return true;
}

function syncEditorStateToBackend() {
    const content = getCurrentEditorText();
    const hasUnsaved = state.isEditing && content !== state.editorOriginalContent;
    const activeTab = getActiveTab();
    const tabTitle = activeTab?.title || "";
    const savePath = state.editingSourcePath || state.currentFilePath || "";
    SyncEditorState(state.isEditing, hasUnsaved, savePath, content, tabTitle).catch((error) => {
        LogError(`SyncEditorState failed: ${error}`);
    });
}

function formatMarkdownDestination(destination) {
    if (!/\s/.test(destination)) return destination;
    return `<${destination}>`;
}

async function persistEditorPreferences() {
    await persistAppSettings();
}

function getCursorLineNumber(editorState = cmView?.state) {
    if (!editorState) return 1;
    return editorState.doc.lineAt(editorState.selection.main.head).number;
}

function getTopVisibleLineNumber(view = cmView) {
    return getVisibleLineNumbers(view, { maxLines: 1 })[0] || 1;
}

function getVisibleLineNumbers(view = cmView, { maxLines = 12, scanPixels = 180 } = {}) {
    if (!view) return [1];

    const contentRect = view.contentDOM.getBoundingClientRect();
    const scrollerRect = view.scrollDOM.getBoundingClientRect();
    const x = Math.max(contentRect.left + 4, scrollerRect.left + 4);
    const startY = Math.max(scrollerRect.top + 1, contentRect.top);
    const endY = Math.min(scrollerRect.bottom - 1, startY + scanPixels);
    const lines = [];

    for (let y = startY; y <= endY && lines.length < maxLines; y += 6) {
        const pos = view.posAtCoords({ x, y });
        if (pos != null) {
            const lineNumber = view.state.doc.lineAt(pos).number;
            if (!lines.includes(lineNumber)) {
                lines.push(lineNumber);
            }
        }
    }

    if (lines.length > 0) {
        return lines;
    }
    const fallbackBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    return [view.state.doc.lineAt(fallbackBlock.from).number];
}

function schedulePreviewScrollSync(view = cmView) {
    if (!view || !state.isEditing || !state.editorPreviewScrollSyncEnabled) {
        return;
    }

    if (previewScrollSyncFrame) {
        cancelAnimationFrame(previewScrollSyncFrame);
    }
    previewScrollSyncFrame = requestAnimationFrame(() => {
        previewScrollSyncFrame = 0;
        const visibleLines = getVisibleLineNumbers(view);
        const nextTopLine = visibleLines[0] || 1;
        lastPreviewTopLine = nextTopLine;
        const editorScrollInfo = {
            scrollTop: view.scrollDOM.scrollTop,
            maxScrollTop: Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight),
            totalLines: view.state.doc.lines,
        };
        scrollPreviewToEditorLines(visibleLines, editorScrollInfo);
    });
}

export function triggerImmediateScrollSync() {
    if (cmView) {
        schedulePreviewScrollSync(cmView);
    }
}


// ── Search Logic ──────────────────────────────────────────
function openFindBar(withReplace = false) {
    if (!state.isEditing || !el.editorFindBar) return;

    isFindBarOpen = true;
    el.editorFindBar.classList.remove('hidden');
    el.editorFindInput.focus();
    el.editorFindInput.select();

    if (withReplace) {
        el.editorFindReplaceCheck.checked = true;
        el.editorReplaceRow.classList.remove('hidden');
    }

    updateFindMatches();
}

function closeFindBar() {
    if (!el.editorFindBar) return;
    isFindBarOpen = false;
    el.editorFindBar.classList.add('hidden');
    if (cmView) cmView.focus();
}

const updateFindMatchesDebounced = debounce(() => {
    if (!cmView || !isFindBarOpen) return;
    const query = el.editorFindInput.value;
    findMatches = [];
    currentMatchIndex = -1;

    if (!query) {
        el.editorFindCount.textContent = '';
        return;
    }

    const cursor = new SearchCursor(cmView.state.doc, query);
    while (!cursor.next().done) {
        findMatches.push({ from: cursor.value.from, to: cursor.value.to });
    }

    if (findMatches.length > 0) {
        const pos = cmView.state.selection.main.from;
        currentMatchIndex = findMatches.findIndex(m => m.from >= pos);
        if (currentMatchIndex === -1) currentMatchIndex = 0;

        el.editorFindCount.textContent = `${currentMatchIndex + 1} of ${findMatches.length}`;
        highlightMatch(currentMatchIndex, false); // Don't jump while typing
    } else {
        el.editorFindCount.textContent = 'No results';
    }
}, 150);

function updateFindMatches() {
    if (!cmView) return;
    const query = el.editorFindInput.value;
    findMatches = [];
    currentMatchIndex = -1;

    if (!query) {
        el.editorFindCount.textContent = '';
        return;
    }

    const cursor = new SearchCursor(cmView.state.doc, query);
    while (!cursor.next().done) {
        findMatches.push({ from: cursor.value.from, to: cursor.value.to });
    }

    if (findMatches.length > 0) {
        const pos = cmView.state.selection.main.from;
        currentMatchIndex = findMatches.findIndex(m => m.from >= pos);
        if (currentMatchIndex === -1) currentMatchIndex = 0;

        highlightMatch(currentMatchIndex, true);
    } else {
        el.editorFindCount.textContent = 'No results';
    }
}

function highlightMatch(index, scrollIntoView = true) {
    if (!cmView || index < 0 || index >= findMatches.length) return;
    const match = findMatches[index];

    cmView.dispatch({
        selection: { anchor: match.from, head: match.to },
        scrollIntoView: scrollIntoView
    });

    el.editorFindCount.textContent = `${index + 1} of ${findMatches.length}`;
}

function findNext() {
    if (findMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % findMatches.length;
    highlightMatch(currentMatchIndex);
}

function findPrev() {
    if (findMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + findMatches.length) % findMatches.length;
    highlightMatch(currentMatchIndex);
}

function performReplace() {
    if (!cmView || currentMatchIndex === -1) return;
    const match = findMatches[currentMatchIndex];
    const replacement = el.editorReplaceInput.value;

    cmView.dispatch({
        changes: { from: match.from, to: match.to, insert: replacement },
        selection: { anchor: match.from, head: match.from + replacement.length }
    });

    updateFindMatches();
}

function performReplaceAll() {
    if (!cmView || findMatches.length === 0) return;
    const query = el.editorFindInput.value;
    const replacement = el.editorReplaceInput.value;

    let changes = [];
    const cursor = new SearchCursor(cmView.state.doc, query);
    while (!cursor.next().done) {
        changes.push({ from: cursor.value.from, to: cursor.value.to, insert: replacement });
    }

    cmView.dispatch({
        changes,
        sequential: true
    });

    updateFindMatches();
    showToast(`Replaced ${changes.length} occurrences.`);
}

function bindEditorSearchEvents() {
    if (!el.edFindReplace) return;

    el.edFindReplace.onclick = () => {
        if (isFindBarOpen) closeFindBar();
        else openFindBar();
    };

    el.editorFindInput.oninput = () => updateFindMatches();

    // Overall Find Bar Keyboard handling
    el.editorFindBar.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFindBar();
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (e.key === 'Tab') {
            const focusableElements = [
                el.editorFindInput,
                el.editorFindPrev,
                el.editorFindNext,
                el.editorFindReplaceCheck,
                el.editorFindDone,
                el.editorReplaceInput,
                el.editorReplaceOne,
                el.editorReplaceAll
            ].filter(element => {
                if (!element) return false;
                // Check if element or its parent row is hidden
                const isReplaceElement = [el.editorReplaceInput, el.editorReplaceOne, el.editorReplaceAll].includes(element);
                if (isReplaceElement && el.editorReplaceRow.classList.contains('hidden')) {
                    return false;
                }
                return true;
            });

            const currentIndex = focusableElements.indexOf(document.activeElement);
            
            if (currentIndex !== -1) {
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift+Tab: move to previous, or wrap to last
                    const prevIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
                    focusableElements[prevIndex].focus();
                } else {
                    // Tab: move to next, or wrap to first
                    const nextIndex = (currentIndex + 1) % focusableElements.length;
                    focusableElements[nextIndex].focus();
                }
            } else {
                // If focus is somewhere else in the bar (like the label), go to first element
                e.preventDefault();
                focusableElements[0].focus();
            }
        }
    });

    el.editorFindInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) findPrev();
            else findNext();
            e.preventDefault();
        }
    };

    el.editorFindPrev.onclick = () => findPrev();
    el.editorFindNext.onclick = () => findNext();
    el.editorFindDone.onclick = () => closeFindBar();

    el.editorFindReplaceCheck.onchange = (e) => {
        el.editorReplaceRow.classList.toggle('hidden', !e.target.checked);
        if (e.target.checked) {
            setTimeout(() => el.editorReplaceInput.focus(), 50);
        }
    };

    el.editorReplaceOne.onclick = () => performReplace();
    el.editorReplaceAll.onclick = () => performReplaceAll();
    el.editorReplaceInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            performReplace();
            e.preventDefault();
        }
    };
}

function bindEditorScrollSync() {
    if (!cmView || editorScrollEventsBound) {
        return;
    }
    editorScrollEventsBound = true;
    cmView.scrollDOM.addEventListener('scroll', () => {
        schedulePreviewScrollSync(cmView);
    }, { passive: true });
}

function schedulePreviewRender(content, delay = 100, editorTopLine = getTopVisibleLineNumber()) {
    clearTimeout(window._renderTimer);
    window._renderTimer = setTimeout(() => {
        if (content === lastRenderedPreviewContent) {
            if (state.editorPreviewScrollSyncEnabled) {
                scrollPreviewToEditorLine(editorTopLine);
            }
            return;
        }
        renderMarkdown(content)
            .then(() => {
                if (state.editorPreviewScrollSyncEnabled) {
                    scrollPreviewToEditorLine(editorTopLine);
                }
            })
            .catch(error => {
                LogError(`Preview render failed: ${error?.message || error}`);
            });
        lastRenderedPreviewContent = content;
    }, delay);
}

function updatePreviewForEditorChange(update) {
    const nextDocText = update.state.doc.toString();
    const nextCursorLine = getCursorLineNumber(update.state);

    if (state.currentEditorRenderMode === 'realtime') {
        if (update.docChanged) {
            const nextTopLine = getTopVisibleLineNumber(update.view);
            queueEditorPreviewRender(nextDocText, nextTopLine, {
                delay: 80,
                syncScroll: state.editorPreviewScrollSyncEnabled,
            });
            lastPreviewTopLine = nextTopLine;
            lastRenderedPreviewContent = nextDocText;
        }
        lastPreviewCursorLine = nextCursorLine;
        if (update.viewportChanged && !update.docChanged) {
            schedulePreviewScrollSync(update.view);
        }
        return;
    }

    if (update.selectionSet && nextCursorLine !== lastPreviewCursorLine) {
        schedulePreviewRender(nextDocText, 0, getTopVisibleLineNumber(update.view));
    }
    if (update.viewportChanged) {
        schedulePreviewScrollSync(update.view);
    }
    lastPreviewCursorLine = nextCursorLine;
}

function removeVoidHtmlClosingTags(update) {
    if (!cmView || !update.docChanged) return false;

    const doc = update.state.doc;
    const changes = [];
    const seen = new Set();

    update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        const scanFrom = Math.max(0, fromB - 200);
        const scanTo = Math.min(doc.length, toB + 200);
        const text = doc.sliceString(scanFrom, scanTo);

        HTML_VOID_TAG_CLOSE_REGEX.lastIndex = 0;
        for (const match of text.matchAll(HTML_VOID_TAG_CLOSE_REGEX)) {
            const closeFrom = scanFrom + match.index + match[1].length;
            const closeTo = closeFrom + match[0].length - match[1].length;
            const key = `${closeFrom}:${closeTo}`;
            if (seen.has(key)) continue;
            seen.add(key);
            changes.push({ from: closeFrom, to: closeTo, insert: '' });
        }
    });

    if (!changes.length) return false;

    changes.sort((a, b) => b.from - a.from);
    cmView.dispatch({ changes });
    return true;
}

function getSlashCommands() {
    const commands = [
        { id: 'bold', label: 'Bold', token: '**', keywords: 'bold strong', aliases: ['볼드', '굵게', '굵은글씨', 'ㅂ'], run: () => applyInlineWrap('**', '**') },
        { id: 'italic', label: 'Italic', token: '*', keywords: 'italic emphasis', aliases: ['이탤릭', '이탤릭체', '기울임', 'ㄱㅇ', 'ㅇㅌ'], run: () => applyInlineWrap('*', '*') },
        { id: 'underline', label: 'Underline', token: '<u>', keywords: 'underline', aliases: ['언더라인', '밑줄', 'ㅁㅈ', 'ㅇㄷ'], run: () => applyInlineWrap('<u>', '</u>') },
        { id: 'strike', label: 'Strikethrough', token: '~~', keywords: 'strike strikethrough', aliases: ['취소선', '스트라이크', 'ㅊㅅㅅ'], run: () => applyInlineWrap('~~', '~~') },
        { id: 'quote', label: 'Blockquote', token: '>', keywords: 'quote blockquote', aliases: ['인용', '인용문', '블록인용', 'ㅇㅇ'], run: () => applyBlockMarker('quote') },
        { id: 'h1', label: 'Heading 1', token: '#', keywords: 'h1 heading title', aliases: ['헤딩', '헤딩1', '헤드', 'ㅎ', '헤', '헤딩원'], run: () => applyBlockMarker('h1') },
        { id: 'h2', label: 'Heading 2', token: '##', keywords: 'h2 heading', aliases: ['헤딩', '헤딩2', '헤드', 'ㅎ', '헤', '헤딩투'], run: () => applyBlockMarker('h2') },
        { id: 'h3', label: 'Heading 3', token: '###', keywords: 'h3 heading', aliases: ['헤딩', '헤딩3', '헤드', 'ㅎ', '헤', '헤딩쓰리'], run: () => applyBlockMarker('h3') },
        { id: 'ul', label: 'Bullet List', token: '- ', keywords: 'unordered list bullet ul', aliases: ['리스트', '목록', '불릿', '글머리표', 'ㄹㅅㅌ'], run: () => applyBlockMarker('ul') },
        { id: 'ol', label: 'Numbered List', token: '1. ', keywords: 'ordered list number ol', aliases: ['번호목록', '숫자목록', '리스트', '목록', 'ㅂㅎ'], run: () => applyBlockMarker('ol') },
        { id: 'hr', label: 'Horizontal Rule', token: '---', keywords: 'rule divider hr', aliases: ['구분선', '수평선', '라인', 'ㄱㅂㅅ'], run: () => insertHorizontalRule() },
        { id: 'link', label: 'Link', token: '[ ]( )', keywords: 'link url', aliases: ['링크', '주소', '링크삽입', 'ㄹㅋ'], run: () => insertLink() },
        { id: 'image', label: 'Image', token: '![ ]( )', keywords: 'image img photo', aliases: ['이미지', '사진', '그림', 'ㅇㅁㅈ'], run: () => insertImage() },
        { id: 'code', label: 'Code Block', token: '```', keywords: 'code block fence', aliases: ['코드', '코드블록', '코드블럭', 'ㅋㄷ'], run: () => insertCodeBlock() },
        { id: 'table', label: 'Table', token: '| |', keywords: 'table grid', aliases: ['테이블', '표', 'ㅌㅇㅂ'], run: () => insertTable() },
        { id: 'div', label: 'DIV Wrapper', token: '<div>', keywords: 'div wrapper align', aliases: ['디브', '박스', '정렬박스', 'ㄷㅂ'], run: () => insertDivWrapper() },
        { id: 'task', label: 'Task List', token: '- [ ]', keywords: 'task checklist todo', aliases: ['체크리스트', '할일', '할일목록', '작업목록', 'ㅊㅋ'], run: () => applyBlockMarker('task') },
        { id: 'find', label: 'Find', token: '/find', keywords: 'find search', aliases: ['찾기', '검색', 'ㅋㄷ', 'ㄱㅅ'], run: () => openFindBar() },
        { id: 'latex', label: 'LaTeX', token: '$$', keywords: 'latex math equation', aliases: ['수식', '라텍스', '공식', 'ㅅㅅ'], run: () => insertLatex() },
        { id: 'emoji', label: 'Emoji', token: ':)', keywords: 'emoji emoticon smile', aliases: ['이모지', '이모티콘', '표정', 'ㅇㅁㅈ'], run: () => insertEmoji() },
    ];

    if (!state.aiFeaturesDisabled && window.aiState?.generalToolbarEnabled) {
        commands.unshift({
            id: 'ask-ai',
            label: 'Ask AI',
            token: 'AI',
            keywords: 'ask ai question prompt assistant',
            aliases: ['ai', 'ask', '질문', '문의', '챗', '대화'],
            run: () => showAskAIPrompt(),
        });
    }

    return commands;
}

function filterSlashCommands(query = "") {
    const normalized = query.trim().toLowerCase();
    const commands = getSlashCommands();
    if (!normalized) return commands;
    return commands.filter(command => {
        const searchTerms = [
            command.label,
            command.keywords,
            command.token,
            ...(command.aliases || [])
        ].map(value => String(value || '').toLowerCase());

        return searchTerms.some(term => term.includes(normalized));
    });
}

function isImeComposing(view = cmView) {
    if (!view) return false;
    const ime = view.state.field(imeStateField, false);
    return !!ime?.composing || !!view.composing;
}

const slashMenuKeymap = Prec.highest(keymap.of([
    {
        key: 'ArrowDown',
        run: () => {
            if (!slashMenuState) return false;
            moveSlashSelection(1);
            return true;
        }
    },
    {
        key: 'ArrowUp',
        run: () => {
            if (!slashMenuState) return false;
            moveSlashSelection(-1);
            return true;
        }
    },
    {
        key: 'Enter',
        run: () => {
            if (!slashMenuState) return false;
            const command = slashMenuState.commands[slashMenuState.selectedIndex];
            if (!command) return true;
            executeSlashCommand(command.id);
            return true;
        }
    },
    {
        key: 'Escape',
        run: () => {
            if (!slashMenuState) return false;
            closeSlashMenu();
            return true;
        }
    }
]));

// 한글 IME 엔터 중복 입력 방지 익스텐션 (v2: Transaction Filter 방식)
const setImeState = StateEffect.define();

const imeStateField = StateField.define({
    create() {
        return {
            composing: false,
            justEndedAt: 0
        };
    },
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setImeState)) {
                value = { ...value, ...e.value };
            }
        }
        return value;
    }
});

const koreanImeEnterFix = [
    imeStateField,
    // 조합 상태는 "관찰"만 합니다.
    EditorView.domEventObservers({
        compositionstart(event, view) {
            view.dispatch({
                effects: setImeState.of({ composing: true })
            });
        },
        compositionupdate(event, view) {
            if (!view.state.field(imeStateField).composing) {
                view.dispatch({
                    effects: setImeState.of({ composing: true })
                });
            }
        },
        compositionend(event, view) {
            view.dispatch({
                effects: setImeState.of({ composing: false, justEndedAt: Date.now() })
            });
        }
    }),
    // 1. 키보드 이벤트 단계에서 차단 (설정 활성화 시에만)
    Prec.highest(keymap.of([{
        key: "Enter",
        run: (view) => {
            if (!state.koreanImeFixEnabled) return false;
            const ime = view.state.field(imeStateField, false);
            if (!ime) return false;
            const delta = Date.now() - ime.justEndedAt;
            if (ime.composing || delta < 100) {
                return true;
            }
            return false;
        }
    }])),
    // 2. 가짜 엔터로 생긴 줄바꿈 transaction 차단 (줄바꿈만 도려내기, 설정 활성화 시에만)
    EditorState.transactionFilter.of(tr => {
        if (!tr.docChanged || !state.koreanImeFixEnabled) return tr;

        const ime = tr.startState.field(imeStateField, false);
        if (!ime) return tr;

        const now = Date.now();
        const delta = now - ime.justEndedAt;

        let hasNewline = false;
        tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            if (inserted.toString().includes("\n")) hasNewline = true;
        });

        if (hasNewline) {
            // 조합 중이거나 종료 후 150ms 이내인 경우만 감시
            if (ime.composing || delta < 150) {
                let changes = [];
                let modified = false;

                tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                    const originalText = inserted.toString();
                    if (originalText.includes("\n")) {
                        const strippedText = originalText.replace(/\n/g, "");
                        changes.push({ from: fromA, to: toA, insert: strippedText });
                        modified = true;
                    } else {
                        changes.push({ from: fromA, to: toA, insert: originalText });
                    }
                });

                if (modified) {
                    return { changes };
                }
            }
        }

        return tr;
    })
];

// ── Editor Mode ────────────────────────────────────────────

export function initCodeMirror() {
    if (cmView) return;

    // Create new CodeMirror view
    const startState = EditorState.create({
        doc: state.currentMarkdownSource || "",
        extensions: [
            Prec.highest(koreanImeEnterFix),
            slashMenuKeymap,
            lineNumbers(),
            history(),
            keymap.of([
                {
                    key: '/',
                    run: () => {
                        if (!cmView) return false;
                        const selection = cmView.state.selection.main;
                        if (selection.empty) return false;
                        return showPromptBoxAtSelection();
                    }
                },
                {
                    key: 'Mod-b',
                    run: () => {
                        applyInlineWrap('**', '**');
                        return true;
                    }
                },
                {
                    key: 'Mod-i',
                    run: () => {
                        applyInlineWrap('*', '*');
                        return true;
                    }
                },
                {
                    key: 'Mod-u',
                    run: () => {
                        applyInlineWrap('<u>', '</u>');
                        return true;
                    }
                },
                {
                    key: 'Mod-f',
                    run: () => {
                        openFindBar();
                        return true;
                    }
                },
                {
                    key: 'Mod-h',
                    run: () => {
                        openFindBar(true);
                        return true;
                    }
                },
                ...defaultKeymap,
                ...historyKeymap,
                indentWithTab
            ]),
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            themeCompartment.of(document.documentElement.classList.contains('dark') ? oneDark : []),
            tokenColorCompartment.of(getTokenColorExtension()),
            koreanImeEnterFix,
            ghostTextField,
            drawSelection(),
            dropCursor(),
            EditorView.lineWrapping,
            EditorView.domEventHandlers({
                blur() {
                    closeSlashMenu();
                    return false;
                },
                keydown(event, view) {
                    if (!slashMenuState) return false;
                    if (!isImeComposing(view)) return false;
                    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return false;

                    event.preventDefault();
                    event.stopPropagation();

                    view.contentDOM.blur();
                    requestAnimationFrame(() => {
                        view.focus();
                        if (event.key === 'ArrowDown') {
                            moveSlashSelection(1);
                        } else {
                            moveSlashSelection(-1);
                        }
                    });
                    return true;
                }
            }),
            EditorView.updateListener.of((update) => {
                if (removeVoidHtmlClosingTags(update)) {
                    return;
                }

                if (update.docChanged) {
                    const val = update.state.doc.toString();
                    state.currentMarkdownSource = val;
                    const tab = getActiveTab();
                    if (tab) tab.currentMarkdownSource = val;
                    syncEditorStateToBackend();

                    if (isFindBarOpen) {
                        updateFindMatchesDebounced();
                    }
                }

                if (update.docChanged || update.selectionSet) {
                    updatePreviewForEditorChange(update);
                }

                // 문서 내용이 바뀌거나 선택 영역이 바뀌어도 undo/redo 활성화 상태가 바뀔 수 있으므로 갱신
                if (update.docChanged || update.selectionSet) {
                    updateNavButtons();
                    updateSlashMenu();
                }
            })
        ]
    });

    cmView = new EditorView({
        state: startState,
        parent: el.editorView
    });
    bindEditorScrollSync();
    bindEditorSearchEvents();

    // hide old textarea
    if (el.markdownEditor) el.markdownEditor.style.display = 'none';

    // Apply font size
    applyEditorFontSize();
    cmView.contentDOM.style.fontFamily = 'var(--code-font)';
}

export function setEditorTheme(isDark) {
    if (cmView) {
        cmView.dispatch({
            effects: themeCompartment.reconfigure(isDark ? oneDark : [])
        });
    }
    state.editorTokenColors = normalizeTokenColors(state.editorTokenColors, isDark ? 'dark' : 'light');
    state.editorBackgroundColor = normalizeBackgroundColor(state.editorBackgroundColor, isDark ? 'dark' : 'light');
    applyEditorTokenColors();
    applyEditorBackgroundColor();
}

export function syncEditorSessionFromState() {
    if (!state.isEditing) {
        return;
    }

    initCodeMirror();

    const nextContent = state.currentMarkdownSource || "";
    const currentContent = cmView.state.doc.toString();
    if (currentContent !== nextContent) {
        cmView.dispatch({
            changes: { from: 0, to: cmView.state.doc.length, insert: nextContent }
        });
    }

    if (!state.editingSourcePath) {
        state.editingSourcePath = state.currentFilePath;
    }
    if (!state.editingSourceFolder) {
        state.editingSourceFolder = state.currentFolder;
    }
    if (!state.editingPreviewPath) {
        state.editingPreviewPath = state.editingSourcePath || state.currentFilePath;
    }
    if (!state.editingPreviewFolder) {
        state.editingPreviewFolder = state.editingSourceFolder || state.currentFolder;
    }

    lastRenderedPreviewContent = nextContent;
    lastPreviewCursorLine = getCursorLineNumber(cmView.state);
    lastPreviewTopLine = getTopVisibleLineNumber(cmView);
    if (el.edRenderMode) {
        el.edRenderMode.value = state.currentEditorRenderMode;
    }
    updateSlashMenu();
    syncEditorStateToBackend();
}

export async function createNewDocument() {
    const defaultName = "Untitiled.md";
    try {
        const selectedPath = await ShowSaveFileDialog(defaultName);
        if (selectedPath) {
            await SaveFile(selectedPath, "");
            await openPath(selectedPath, { pushHistory: true, setHome: true, newTab: true });
            enterEditMode();
            showToast("New document created.");
        }
    } catch (e) {
        console.error("Failed to create new document:", e);
    }
}

export function enterEditMode() {
    if (state.isEditing) {
        handleCancel();
        return;
    }
    if (state.currentDocumentType !== 'markdown') return;

    hideLinkTooltip();
    initCodeMirror();

    state.isEditing = true;
    state.editorOriginalContent = state.currentMarkdownSource;
    state.editingSourcePath = state.currentFilePath;
    state.editingSourceFolder = state.currentFolder;
    state.editingPreviewPath = state.currentFilePath;
    state.editingPreviewFolder = state.currentFolder;

    cmView.dispatch({
        changes: { from: 0, to: cmView.state.doc.length, insert: state.currentMarkdownSource }
    });
    lastPreviewCursorLine = getCursorLineNumber(cmView.state);
    lastPreviewTopLine = 0;
    if (el.edRenderMode) {
        el.edRenderMode.value = state.currentEditorRenderMode;
    }

    el.editToolbar.classList.remove('hidden');
    el.editorView.classList.remove('hidden');
    el.mainContainer.classList.add('is-editing');
    el.btnEdit.classList.add('active');

    el.contentView.classList.remove('hidden');
    el.selectEngine.disabled = true;

    el.btnBack.disabled = true;
    el.btnForward.disabled = true;
    el.btnHome.disabled = true;

    // Also dispatch an empty ghost text just in case
    if (window.aiState) window.aiState.ghostText = "";
    syncAIControls();
    updateSlashMenu();
    cmView.focus();
    schedulePreviewScrollSync(cmView);
    updateNavButtons(); // 에디터 진입 시 버튼 아이콘/상태 전환을 위해 호출
    syncEditorStateToBackend();
}

export async function exitEditMode(didSave = false) {
    if (!state.isEditing) return;
    hideLinkTooltip();
    closeSlashMenu();
    clearTimeout(window._renderTimer);

    state.isEditing = false;
    state.editingSourcePath = "";
    state.editingSourceFolder = "";
    state.editingPreviewPath = "";
    state.editingPreviewFolder = "";
    el.editToolbar.classList.add('hidden');
    syncAIControls();
    el.editorView.classList.add('hidden');
    el.mainContainer.classList.remove('is-editing');
    el.btnEdit.classList.remove('active');
    el.selectEngine.disabled = false;

    updateNavButtons();

    if (didSave) {
        const { reloadCurrent } = await import('./main-navigation.js');
        await reloadCurrent();
    } else {
        state.currentMarkdownSource = state.editorOriginalContent;
        const tab = getActiveTab();
        if (tab) tab.currentMarkdownSource = state.editorOriginalContent;
        await renderActiveTab();
    }
    syncEditorStateToBackend();
}

export function hasUnsavedEditorChanges() {
    return state.isEditing && getCurrentEditorText() !== state.editorOriginalContent;
}

export function hasUnsavedTabChanges(tab) {
    if (!tab?.isEditing) return false;
    return (tab.currentMarkdownSource || "") !== (tab.editorOriginalContent || "");
}

export async function saveCurrentDocument({ confirm = true, exitAfterSave = true } = {}) {
    if (!cmView) return;
    const contentToSave = cmView.state.doc.toString();
    const targetPath = state.editingSourcePath || state.currentFilePath;
    const savingTabId = state.activeTabId;
    const savingTab = getActiveTab();
    const dialogMessage = formatSaveDialogMessage(savingTab?.title, "Do you want to save changes to the file?");
    if (confirm) {
        const ok = await AskConfirm("Save Changes", dialogMessage, "Save", "Cancel");
        if (!ok) return false;
    }

    try {
        await SaveFile(targetPath, contentToSave);
        showToast("File saved successfully.", "check_circle");
        if (savingTab) {
            savingTab.currentMarkdownSource = contentToSave;
            savingTab.editorOriginalContent = contentToSave;
            savingTab.editingPreviewPath = savingTab.editingSourcePath || targetPath;
            savingTab.editingPreviewFolder = savingTab.editingSourceFolder || getPathDirname(targetPath);
        }
        if (state.activeTabId === savingTabId) {
            state.editorOriginalContent = contentToSave;
            state.currentMarkdownSource = contentToSave;
            state.editingPreviewPath = state.editingSourcePath || targetPath;
            state.editingPreviewFolder = state.editingSourceFolder || getPathDirname(targetPath);
            syncEditorStateToBackend();
            if (exitAfterSave) {
                await exitEditMode(true);
            }
        }
        return true;
    } catch (error) {
        LogError(`Save failed: ${error}`);
        showToast("Failed to save file.", "error");
        return false;
    }
}

export async function saveTabDocument(tab, { confirm = true } = {}) {
    if (!tab) return false;
    const contentToSave = tab.currentMarkdownSource || "";
    const targetPath = tab.editingSourcePath || tab.path;
    const dialogMessage = formatSaveDialogMessage(tab.title, "Do you want to save changes to the file?");

    if (confirm) {
        const ok = await AskConfirm("Save Changes", dialogMessage, "Save", "Cancel");
        if (!ok) return false;
    }

    try {
        await SaveFile(targetPath, contentToSave);
        tab.editorOriginalContent = contentToSave;
        tab.currentMarkdownSource = contentToSave;
        tab.editingPreviewPath = tab.editingSourcePath || targetPath;
        tab.editingPreviewFolder = tab.editingSourceFolder || getPathDirname(targetPath);
        showToast("File saved successfully.", "check_circle");
        return true;
    } catch (error) {
        LogError(`Save failed: ${error}`);
        showToast("Failed to save file.", "error");
        return false;
    }
}

async function handleSave() {
    await saveCurrentDocument({ confirm: true, exitAfterSave: true });
}

async function handleCancel() {
    if (hasUnsavedEditorChanges()) {
        const activeTab = getActiveTab();
        const ok = await AskConfirm("Unsaved Changes", formatSaveDialogMessage(activeTab?.title, "You have unsaved changes. Discard them?"), "Discard", "Cancel");
        if (!ok) return;
    }
    exitEditMode(false);
}

function applyInlineWrap(prefix, suffix = prefix) {
    if (!cmView) return;
    const selection = cmView.state.selection.main;
    const text = cmView.state.sliceDoc(selection.from, selection.to);

    if (!text) {
        const insertText = prefix + suffix;
        cmView.dispatch({
            changes: { from: selection.from, to: selection.to, insert: insertText },
            selection: { anchor: selection.from + prefix.length }
        });
        cmView.focus();
        return;
    }

    cmView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: `${prefix}${text}${suffix}` },
        selection: {
            anchor: selection.from + prefix.length,
            head: selection.from + prefix.length + text.length
        }
    });
    cmView.focus();
}

function getLineRangeForSelection(range) {
    const startLine = cmView.state.doc.lineAt(range.from);
    const endAnchor = range.empty ? range.to : Math.max(range.from, range.to - 1);
    const endLine = cmView.state.doc.lineAt(endAnchor);
    return { startLine, endLine };
}

function normalizeBlockLine(text) {
    const match = text.match(/^(\s*)(#{1,6}\s+|>\s?|-\s\[\s\]\s+|\d+\.\s+|[-*+]\s+)?(.*)$/);
    return {
        indent: match?.[1] ?? "",
        content: match?.[3] ?? text
    };
}

function buildBlockLine(text, marker) {
    const { indent, content } = normalizeBlockLine(text);
    return `${indent}${marker}${content}`;
}

function applyBlockMarker(type) {
    if (!cmView) return;
    const selection = cmView.state.selection.main;
    const { startLine, endLine } = getLineRangeForSelection(selection);
    const lines = [];

    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
        const line = cmView.state.doc.line(lineNumber);
        if (type === 'hr') {
            lines.push('---');
            continue;
        }

        switch (type) {
            case 'quote':
                lines.push(buildBlockLine(line.text, '> '));
                break;
            case 'h1':
                lines.push(buildBlockLine(line.text, '# '));
                break;
            case 'h2':
                lines.push(buildBlockLine(line.text, '## '));
                break;
            case 'h3':
                lines.push(buildBlockLine(line.text, '### '));
                break;
            case 'ul':
                lines.push(buildBlockLine(line.text, '- '));
                break;
            case 'ol':
                lines.push(buildBlockLine(line.text, '1. '));
                break;
            case 'task':
                lines.push(buildBlockLine(line.text, '- [ ] '));
                break;
            default:
                lines.push(line.text);
        }
    }

    const from = startLine.from;
    const to = endLine.to;
    const replacement = lines.join('\n');
    const firstLineMarkerEnd = from + (lines[0].length - normalizeBlockLine(startLine.text).content.length);
    cmView.dispatch({
        changes: { from, to, insert: replacement },
        selection: selection.empty
            ? { anchor: firstLineMarkerEnd }
            : { anchor: from, head: from + replacement.length }
    });
    cmView.focus();
}

function insertHorizontalRule() {
    if (!cmView) return;
    const selection = cmView.state.selection.main;
    const line = cmView.state.doc.lineAt(selection.from);
    const prefix = selection.from > line.from ? '\n' : '';
    const suffix = selection.from < line.to ? '\n' : '';
    const insert = `${prefix}---${suffix}`;
    cmView.dispatch({
        changes: { from: selection.from, to: selection.to, insert },
        selection: { anchor: selection.from + insert.length }
    });
    cmView.focus();
}

// ── Text Insert ────────────────────────────────────────────

export function insertTextAtCursor(prefix, suffix) {
    if (!cmView) return;
    const stateObj = cmView.state;
    const selection = stateObj.selection.main;
    const text = stateObj.sliceDoc(selection.from, selection.to);

    const insertText = prefix + text + suffix;
    cmView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: insertText },
        selection: { anchor: selection.from + prefix.length, head: selection.from + prefix.length + text.length }
    });
    cmView.focus();
}

export async function insertFileLink(filePath, isImage = false) {
    if (!cmView || !filePath) return;

    let displayPath = filePath;
    try {
        const base = state.editingSourcePath || state.currentFilePath || "";
        const rel = await GetRelativePath(base, filePath);
        if (rel) {
            displayPath = rel;
        }
    } catch (error) {
        console.error("Failed to get relative path:", error);
    }

    const formattedPath = formatMarkdownDestination(displayPath);
    const fileName = basename(filePath);
    const prefix = isImage ? `![${fileName}](` : `[${fileName}](`;
    const suffix = `)`;

    insertTextAtCursor(prefix, suffix);
    
    // Replace the inner text (fileName) with the formatted path
    const selection = cmView.state.selection.main;
    cmView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: formattedPath },
        selection: { anchor: selection.from + formattedPath.length }
    });
}


export function insertPlainTextAtCursor(text) {
    if (!cmView || !text) return;
    const selection = cmView.state.selection.main;
    cmView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + text.length }
    });
    cmView.focus();
}

function closeSlashMenu() {
    slashMenuState = null;
    if (el.editorSlashMenu) {
        el.editorSlashMenu.classList.add('hidden');
        el.editorSlashMenu.innerHTML = '';
    }
}

function renderSlashMenu() {
    if (!el.editorSlashMenu || !slashMenuState) {
        closeSlashMenu();
        return;
    }

    const { commands, selectedIndex, anchorTop, anchorBottom, anchorLeft } = slashMenuState;
    if (!commands.length) {
        el.editorSlashMenu.innerHTML = '<div class="editor-slash-empty">No matching commands.</div>';
    } else {
        el.editorSlashMenu.innerHTML = commands.map((command, index) => `
            <button
                type="button"
                class="editor-slash-item ${index === selectedIndex ? 'active' : ''}"
                data-command-id="${command.id}"
                role="option"
                aria-selected="${index === selectedIndex ? 'true' : 'false'}"
            >
                <span>
                    <span class="editor-slash-label">${command.label}</span>
                    <span class="editor-slash-meta">${command.keywords}</span>
                </span>
                <span class="editor-slash-token">${command.token}</span>
            </button>
        `).join('');
    }

    el.editorSlashMenu.classList.remove('hidden');

    const hostRect = el.editorView?.getBoundingClientRect();
    const menuRect = el.editorSlashMenu.getBoundingClientRect();
    if (!hostRect) return;

    const horizontalPadding = 12;
    const verticalPadding = 12;
    const maxLeft = Math.max(horizontalPadding, hostRect.width - menuRect.width - horizontalPadding);
    const left = Math.max(horizontalPadding, Math.min(anchorLeft, maxLeft));

    const belowTop = anchorBottom + 10;
    const aboveTop = anchorTop - menuRect.height - 10;
    const maxTop = Math.max(verticalPadding, hostRect.height - menuRect.height - verticalPadding);
    const top = belowTop + menuRect.height <= hostRect.height - verticalPadding
        ? belowTop
        : Math.max(verticalPadding, Math.min(aboveTop, maxTop));

    el.editorSlashMenu.style.left = `${left}px`;
    el.editorSlashMenu.style.top = `${top}px`;

    const activeItem = el.editorSlashMenu.querySelector('.editor-slash-item.active');
    if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
    }
}

function updateSlashMenu() {
    if (!cmView || !state.isEditing) {
        closeSlashMenu();
        return;
    }

    const selection = cmView.state.selection.main;
    if (!selection.empty) {
        closeSlashMenu();
        return;
    }

    const line = cmView.state.doc.lineAt(selection.from);
    const beforeCursor = line.text.slice(0, selection.from - line.from);
    const match = beforeCursor.match(/(^|\s)\/([^\s/]*)$/);
    if (!match) {
        closeSlashMenu();
        return;
    }

    const query = match[2] || '';
    const commandStart = selection.from - query.length - 1;
    const commands = filterSlashCommands(query);
    const coords = cmView.coordsAtPos(selection.from);
    const hostRect = el.editorView?.getBoundingClientRect();
    if (!coords || !hostRect) {
        closeSlashMenu();
        return;
    }

    slashMenuState = {
        from: commandStart,
        to: selection.from,
        query,
        commands,
        selectedIndex: Math.min(slashMenuState?.selectedIndex ?? 0, Math.max(commands.length - 1, 0)),
        anchorTop: coords.top - hostRect.top,
        anchorBottom: coords.bottom - hostRect.top,
        anchorLeft: coords.left - hostRect.left,
    };
    renderSlashMenu();
}

function moveSlashSelection(delta) {
    if (!slashMenuState || slashMenuState.commands.length === 0) return;
    const count = slashMenuState.commands.length;
    slashMenuState.selectedIndex = (slashMenuState.selectedIndex + delta + count) % count;
    renderSlashMenu();
}

async function executeSlashCommand(commandId) {
    if (!cmView || !slashMenuState) return;
    const command = slashMenuState.commands.find(item => item.id === commandId);
    const commandRange = { from: slashMenuState.from, to: slashMenuState.to };
    closeSlashMenu();
    if (!command) return;

    cmView.dispatch({
        changes: { from: commandRange.from, to: commandRange.to, insert: '' },
        selection: { anchor: commandRange.from }
    });

    await command.run();
}

function bindSlashMenuEvents() {
    if (!el.editorSlashMenu || slashMenuEventsBound) return;
    slashMenuEventsBound = true;

    el.editorSlashMenu.addEventListener('mousedown', event => {
        event.preventDefault();
    });

    el.editorSlashMenu.addEventListener('mousemove', event => {
        const button = event.target.closest('.editor-slash-item');
        if (!button || !slashMenuState) return;
        const index = slashMenuState.commands.findIndex(command => command.id === button.dataset.commandId);
        if (index < 0 || index === slashMenuState.selectedIndex) return;
        slashMenuState.selectedIndex = index;
        renderSlashMenu();
    });

    el.editorSlashMenu.addEventListener('click', event => {
        const button = event.target.closest('.editor-slash-item');
        if (!button) return;
        executeSlashCommand(button.dataset.commandId);
    });
}

// ── Undo / Redo Actions ─────────────────────────────────────

export function undoAction() {
    if (!cmView) return;
    undo(cmView);
}

export function redoAction() {
    if (!cmView) return;
    redo(cmView);
}

export function getUndoDepth() {
    if (!cmView) return 0;
    return undoDepth(cmView.state);
}

export function getRedoDepth() {
    if (!cmView) return 0;
    return redoDepth(cmView.state);
}

async function insertLink() {
    const choice = await AskConfirm("Insert Link", "Would you like to enter a URL manually or select a local file?", "Local File", "Manual URL");
    if (choice) {
        const absPath = await SelectDocument(state.currentFilePath);
        if (absPath) {
            const relPath = await GetRelativePath(state.currentFilePath, absPath);
            insertTextAtCursor('[', `](${formatMarkdownDestination(relPath)})`);
        }
        return;
    }

    const url = await showCustomPrompt("Insert Link", "Enter link URL:", "https://");
    if (url) insertTextAtCursor('[', `](${formatMarkdownDestination(url)})`);
}

async function insertImage() {
    const choice = await AskConfirm("Insert Image", "Would you like to enter an image URL manually or select a local image?", "Local File", "Manual URL");
    if (choice) {
        const absPath = await SelectImage(state.currentFilePath);
        if (absPath) {
            const relPath = await GetRelativePath(state.currentFilePath, absPath);
            insertTextAtCursor('![', `](${formatMarkdownDestination(relPath)})`);
        }
        return;
    }

    const url = await showCustomPrompt("Insert Image", "Enter image URL:", "https://");
    if (url) insertTextAtCursor('![', `](${formatMarkdownDestination(url)})`);
}

function insertCodeBlock() {
    insertTextAtCursor('\n\`\`\`\n', '\n\`\`\`\n');
}

async function insertTable() {
    const rowStr = await showCustomPrompt("Insert Table", "Rows (행 수):", "3");
    if (!rowStr) return;
    const colStr = await showCustomPrompt("Insert Table", "Columns (열 수):", "3");
    if (!colStr) return;

    const rows = parseInt(rowStr || "0");
    const cols = parseInt(colStr || "0");
    if (rows > 0 && cols > 0) {
        let table = '\n|';
        for (let c = 0; c < cols; c++) table += ` Header ${c + 1} |`;
        table += '\n|';
        for (let c = 0; c < cols; c++) table += ' --- |';
        for (let r = 0; r < rows; r++) {
            table += '\n|';
            for (let c = 0; c < cols; c++) table += ' Cell |';
        }
        table += '\n';
        insertTextAtCursor(table, '');
    }
}

async function insertLatex() {
    const block = await AskConfirm("LaTeX Math", "Use block math ($$)?\n(Cancel for inline math $)", "Block ($$)", "Inline ($)");
    const tag = block ? '$$' : '$';
    insertTextAtCursor(tag, tag);
}

async function insertEmoji() {
    const choice = await showEmojiPicker();
    if (choice) insertTextAtCursor(choice, '');
}

async function insertDivWrapper() {
    const align = await showOptionGridPrompt("DIV Wrapper", "Choose alignment with arrow keys, then press Enter.", [
        { value: 'top-left', label: 'Top left', previewIndex: 0 },
        { value: 'top-center', label: 'Top center', previewIndex: 1 },
        { value: 'top-right', label: 'Top right', previewIndex: 2 },
        { value: 'center-left', label: 'Center left', previewIndex: 3 },
        { value: 'center', label: 'Center', previewIndex: 4 },
        { value: 'center-right', label: 'Center right', previewIndex: 5 },
        { value: 'bottom-left', label: 'Bottom left', previewIndex: 6 },
        { value: 'bottom-center', label: 'Bottom center', previewIndex: 7 },
        { value: 'bottom-right', label: 'Bottom right', previewIndex: 8 },
    ], 'center');
    if (!align) return;
    const width = await showCustomPrompt("DIV Wrapper", "Width (e.g. 100%, 400px):", "100%");
    if (!width) return;

    const alignMap = {
        'top-left': { placeItems: 'start start', textAlign: 'left' },
        'top-center': { placeItems: 'start center', textAlign: 'center' },
        'top-right': { placeItems: 'start end', textAlign: 'right' },
        'center-left': { placeItems: 'center start', textAlign: 'left' },
        'center': { placeItems: 'center center', textAlign: 'center' },
        'center-right': { placeItems: 'center end', textAlign: 'right' },
        'bottom-left': { placeItems: 'end start', textAlign: 'left' },
        'bottom-center': { placeItems: 'end center', textAlign: 'center' },
        'bottom-right': { placeItems: 'end end', textAlign: 'right' },
    };

    const selectedAlign = alignMap[align] || alignMap.center;
    const style = `display: grid; width: ${width}; place-items: ${selectedAlign.placeItems}; text-align: ${selectedAlign.textAlign};`;

    insertTextAtCursor(`<div style="${style}">\n`, '\n</div>');
}

// ── Custom Prompt Modal ────────────────────────────────────
export function showCustomPrompt(title, message, defaultValue = "") {
    return new Promise((resolve) => {
        el.modalTitle.textContent = title;
        el.modalMessage.textContent = message;
        el.modalInput.value = defaultValue;
        el.modalOverlay.classList.remove('hidden');
        el.modalBtnOk.classList.remove('hidden');

        setTimeout(() => el.modalInput.focus(), 50);

        const handleOk = () => {
            const val = el.modalInput.value;
            cleanup();
            resolve(val);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const handleKey = (e) => {
            if (e.key === 'Enter') handleOk();
            if (e.key === 'Escape') handleCancel();
        };

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            el.modalBtnOk.removeEventListener('click', handleOk);
            el.modalBtnCancel.removeEventListener('click', handleCancel);
            el.modalInput.removeEventListener('keydown', handleKey);
        };

        el.modalBtnOk.addEventListener('click', handleOk);
        el.modalBtnCancel.addEventListener('click', handleCancel);
        el.modalInput.addEventListener('keydown', handleKey);

        el.modalInputGroup.classList.remove('hidden');
        el.modalOptionGrid.classList.add('hidden');
        el.modalEmojiGrid.classList.add('hidden');
    });
}

export function showOptionGridPrompt(title, message, options, defaultValue = "") {
    return new Promise((resolve) => {
        const normalizedOptions = Array.isArray(options) ? options.filter(Boolean) : [];
        if (normalizedOptions.length === 0) {
            resolve(null);
            return;
        }

        let selectedIndex = Math.max(0, normalizedOptions.findIndex(option => option.value === defaultValue));

        const renderOptionCell = (option, index) => {
            const targetIndex = Math.max(0, Math.min(8, Number(option.previewIndex) || 4));
            const dots = Array.from({ length: 9 }, (_, dotIndex) => `
                <span class="modal-option-dot ${dotIndex === targetIndex ? 'is-target' : ''}"></span>
            `).join('');
            return `
                <button
                    type="button"
                    class="modal-option-cell ${index === selectedIndex ? 'active' : ''}"
                    data-option-index="${index}"
                    aria-label="${option.label}"
                >
                    <span class="modal-option-preview" aria-hidden="true">${dots}</span>
                </button>
            `;
        };

        const syncActiveState = () => {
            el.modalOptionGrid.querySelectorAll('.modal-option-cell').forEach((node, index) => {
                node.classList.toggle('active', index === selectedIndex);
            });
        };

        const moveSelection = (deltaRow, deltaCol) => {
            const row = Math.floor(selectedIndex / 3);
            const col = selectedIndex % 3;
            const nextRow = Math.max(0, Math.min(2, row + deltaRow));
            const nextCol = Math.max(0, Math.min(2, col + deltaCol));
            selectedIndex = nextRow * 3 + nextCol;
            syncActiveState();
        };

        const confirmSelection = () => {
            const selected = normalizedOptions[selectedIndex];
            cleanup();
            resolve(selected?.value ?? null);
        };

        const cancelSelection = () => {
            cleanup();
            resolve(null);
        };

        const handleGridClick = event => {
            const button = event.target.closest('.modal-option-cell');
            if (!button) return;
            selectedIndex = Number(button.dataset.optionIndex) || 0;
            confirmSelection();
        };

        const handleKey = event => {
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveSelection(-1, 0);
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveSelection(1, 0);
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveSelection(0, -1);
                return;
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveSelection(0, 1);
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                confirmSelection();
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                cancelSelection();
            }
        };

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            el.modalOptionGrid.removeEventListener('click', handleGridClick);
            document.removeEventListener('keydown', handleKey, true);
            el.modalBtnOk.removeEventListener('click', confirmSelection);
            el.modalBtnCancel.removeEventListener('click', cancelSelection);
            el.modalBtnOk.classList.remove('hidden');
        };

        el.modalTitle.textContent = title;
        el.modalMessage.textContent = message;
        el.modalOptionGrid.innerHTML = normalizedOptions.map(renderOptionCell).join('');
        el.modalOverlay.classList.remove('hidden');
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.remove('hidden');
        el.modalEmojiGrid.classList.add('hidden');
        el.modalBtnOk.classList.remove('hidden');

        syncActiveState();

        el.modalOptionGrid.addEventListener('click', handleGridClick);
        document.addEventListener('keydown', handleKey, true);
        el.modalBtnOk.addEventListener('click', confirmSelection);
        el.modalBtnCancel.addEventListener('click', cancelSelection);
    });
}

const emojiData = [
    {
        name: "GitHub",
        emojis: ["👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀", "✅", "❌", "📝", "💡", "⚠️", "⭐", "✨"]
    },
    {
        name: "Smileys",
        emojis: [
            "😀", "😃", "😄", "😁", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😋", "😛", "😜", "🤪",
            "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺",
            "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫",
            "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢",
            "🤮", "🤧", "😷", "🤒", "🤕"
        ]
    },
    {
        name: "People",
        emojis: [
            "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️",
            "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦿",
            "🦶", "👣", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄"
        ]
    },
    {
        name: "Animals",
        emojis: [
            "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉",
            "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛",
            "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑",
            "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏",
            "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈",
            "🐈‍⬛", "🐓", "🦃", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦦", "🦥", "🐁", "🐀", "🐿️", "🦔"
        ]
    },
    {
        name: "Food",
        emojis: [
            "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆",
            "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀",
            "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮",
            "🌯", "🫔", "🥗", "🥘", "🫕", "🥣", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘", "🍥",
            "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰",
            "🥜", "🍯", "🥛", "🍼", "☕", "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾",
            "🧊", "🥄", "🍴", "🍽️", "🥣", "🥡", "🥢", "🧂"
        ]
    },
    {
        name: "Symbols",
        emojis: [
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟",
            "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎",
            "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️", "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️", "🆚",
            "💮", "🉐", "㊙️", "㊗️", "🈴", "🈵", "🈹", "🈲", "🅰️", "🅱️", "🆑", "🅾️", "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫",
            "💯", "💢", "♨️", "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼️", "⁉️", "🔅", "🔆", "〽️",
            "⚠️", "🚸", "🔱", "⚜️", "🔰", "♻️", "✅", "🈯", "💹", "❇️", "✳️", "❎", "🌐", "💠", "Ⓜ️", "🌀", "💤", "🏧", "🚾",
            "♿", "🅿️", "🈳", "🈂️", "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "⚧️", "🚻", "🚮", "🎦", "📶", "🈁", "🔣", "ℹ️",
            "🔤", "🔡", "🔠", "🆖", "🆗", "🆙", "🆒", "🆕", "🆓", "0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣",
            "9️⃣", "🔟", "🔢", "#️⃣", "*️⃣", "⏏️", "▶️", "⏸️", "⏯️", "⏹️", "⏺️", "⏭️", "⏮️", "⏩", "⏪", "⏫", "⏬", "◀️", "🔼",
            "🔽", "➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "↙️", "↖️", "↕️", "↔️", "↪️", "↩️", "⤴️", "⤵️", "🔀", "🔁", "🔂", "🔄",
            "🔃", "🎵", "🎶", "➕", "➖", "➗", "✖️", "♾️", "💲", "💱", "™️", "©️", "®️", "🔚", "🔙", "🔛", "🔝", "🔜", "〰️",
            "➰", "➿", "✔️", "☑️", "🔘", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔺", "🔻", "🔸", "🔹", "🔶",
            "🔷", "🔳", "🔲", "▪️", "▫️", "◾", "◽", "◼️", "◻️", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "⬛", "⬜", "🟫", "🔈",
            "🔇", "🔉", "🔊", "🔔", "🔕", "📣", "📢", "💬", "💭", "🗯️", "♠️", "♣️", "♥️", "♦️", "🃏", "🎴", "🀄"
        ]
    }
];

export function showEmojiPicker() {
    return new Promise((resolve) => {
        let currentCategoryIndex = 0;
        let selectedEmojiIndex = -1;

        el.modalTitle.textContent = "Select Emoji";
        el.modalMessage.textContent = "Browse categories and select an emoji to insert.";
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.add('hidden');
        el.modalEmojiContainer.classList.remove('hidden');
        el.modalOverlay.classList.remove('hidden');

        const renderCategories = () => {
            el.modalEmojiCategories.innerHTML = emojiData.map((cat, idx) => `
                <button class="emoji-category-btn ${idx === currentCategoryIndex ? 'active' : ''}" 
                        data-index="${idx}" tabindex="0">${cat.name}</button>
            `).join('');
        };

        const renderEmojis = () => {
            const emojis = emojiData[currentCategoryIndex].emojis;
            el.modalEmojiGrid.innerHTML = emojis.map((emoji, idx) => `
                <div class="emoji-item ${idx === selectedEmojiIndex ? 'selected' : ''}" 
                     data-emoji="${emoji}" data-index="${idx}" tabindex="0">${emoji}</div>
            `).join('');
        };

        const updateSelection = () => {
            const items = el.modalEmojiGrid.querySelectorAll('.emoji-item');
            items.forEach((item, idx) => {
                item.classList.toggle('selected', idx === selectedEmojiIndex);
                if (idx === selectedEmojiIndex) {
                    item.focus();
                    item.scrollIntoView({ block: 'nearest' });
                }
            });
        };

        const handleCategoryClick = (e) => {
            const btn = e.target.closest('.emoji-category-btn');
            if (btn) {
                currentCategoryIndex = parseInt(btn.dataset.index);
                selectedEmojiIndex = -1;
                renderCategories();
                renderEmojis();
            }
        };

        const handleEmojiClick = (e) => {
            const item = e.target.closest('.emoji-item');
            if (item) {
                const emoji = item.dataset.emoji;
                cleanup();
                resolve(emoji);
            }
        };

        const handleKeyDown = (e) => {
            const emojis = emojiData[currentCategoryIndex].emojis;
            const cols = 6;

            if (e.key === 'Tab') {
                // Let native tab handle focusing between categories and grid
                return;
            }

            if (document.activeElement.classList.contains('emoji-category-btn')) {
                if (e.key === 'ArrowRight') {
                    currentCategoryIndex = (currentCategoryIndex + 1) % emojiData.length;
                    renderCategories();
                    renderEmojis();
                    el.modalEmojiCategories.querySelectorAll('.emoji-category-btn')[currentCategoryIndex].focus();
                    e.preventDefault();
                } else if (e.key === 'ArrowLeft') {
                    currentCategoryIndex = (currentCategoryIndex - 1 + emojiData.length) % emojiData.length;
                    renderCategories();
                    renderEmojis();
                    el.modalEmojiCategories.querySelectorAll('.emoji-category-btn')[currentCategoryIndex].focus();
                    e.preventDefault();
                } else if (e.key === 'ArrowDown') {
                    selectedEmojiIndex = 0;
                    updateSelection();
                    e.preventDefault();
                }
            } else if (document.activeElement.classList.contains('emoji-item') || selectedEmojiIndex >= 0) {
                if (selectedEmojiIndex === -1) selectedEmojiIndex = 0;

                if (e.key === 'ArrowRight') {
                    selectedEmojiIndex = (selectedEmojiIndex + 1) % emojis.length;
                    updateSelection();
                    e.preventDefault();
                } else if (e.key === 'ArrowLeft') {
                    selectedEmojiIndex = (selectedEmojiIndex - 1 + emojis.length) % emojis.length;
                    updateSelection();
                    e.preventDefault();
                } else if (e.key === 'ArrowDown') {
                    if (selectedEmojiIndex + cols < emojis.length) {
                        selectedEmojiIndex += cols;
                    } else {
                        // Stay on last row? Or wrap?
                    }
                    updateSelection();
                    e.preventDefault();
                } else if (e.key === 'ArrowUp') {
                    if (selectedEmojiIndex - cols >= 0) {
                        selectedEmojiIndex -= cols;
                    } else {
                        // Go back to categories?
                        selectedEmojiIndex = -1;
                        renderEmojis();
                        el.modalEmojiCategories.querySelectorAll('.emoji-category-btn')[currentCategoryIndex].focus();
                    }
                    updateSelection();
                    e.preventDefault();
                } else if (e.key === 'Enter' || e.key === ' ') {
                    const emoji = emojis[selectedEmojiIndex];
                    if (emoji) {
                        cleanup();
                        resolve(emoji);
                    }
                    e.preventDefault();
                }
            }

            if (e.key === 'Escape') {
                handleCancelClick();
                e.preventDefault();
            }
        };

        const handleCancelClick = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            el.modalEmojiContainer.classList.add('hidden');
            el.modalEmojiCategories.removeEventListener('click', handleCategoryClick);
            el.modalEmojiGrid.removeEventListener('click', handleEmojiClick);
            el.modalBtnCancel.removeEventListener('click', handleCancelClick);
            document.removeEventListener('keydown', handleKeyDown, true);
            el.modalBtnOk.classList.remove('hidden');
        };

        el.modalBtnOk.classList.add('hidden');
        renderCategories();
        renderEmojis();

        el.modalEmojiCategories.addEventListener('click', handleCategoryClick);
        el.modalEmojiGrid.addEventListener('click', handleEmojiClick);
        el.modalBtnCancel.addEventListener('click', handleCancelClick);
        document.addEventListener('keydown', handleKeyDown, true);
        
        // Initial focus
        setTimeout(() => {
            el.modalEmojiCategories.querySelectorAll('.emoji-category-btn')[currentCategoryIndex].focus();
        }, 10);
    });
}

// ── Editor Event Bindings ──────────────────────────────────

export function bindEditorEvents() {
    bindSlashMenuEvents();
    el.edBold.onclick = () => applyInlineWrap('**', '**');
    el.edItalic.onclick = () => applyInlineWrap('*', '*');
    el.edUnderline.onclick = () => applyInlineWrap('<u>', '</u>');
    el.edStrike.onclick = () => applyInlineWrap('~~', '~~');
    el.edQuote.onclick = () => applyBlockMarker('quote');
    el.edH1.onclick = () => applyBlockMarker('h1');
    el.edH2.onclick = () => applyBlockMarker('h2');
    el.edH3.onclick = () => applyBlockMarker('h3');
    el.edUl.onclick = () => applyBlockMarker('ul');
    el.edOl.onclick = () => applyBlockMarker('ol');
    el.edHr.onclick = () => insertHorizontalRule();

    el.edLink.onclick = insertLink;
    el.edImage.onclick = insertImage;
    el.edCode.onclick = insertCodeBlock;
    el.edTable.onclick = insertTable;

    el.edTask.onclick = () => applyBlockMarker('task');
    el.edLatex.onclick = insertLatex;

    el.edEmoji.onclick = insertEmoji;

    el.edDiv.onclick = insertDivWrapper;
    el.edRenderMode.onchange = async event => {
        state.currentEditorRenderMode = event.target.value || 'realtime';
        lastPreviewCursorLine = getCursorLineNumber(cmView?.state);
        schedulePreviewRender(getCurrentEditorText(), 0);
        await persistEditorPreferences();
    };

    el.edFontMinus.onclick = () => {
        changeEditorFontSize(-1);
    };

    el.edFontPlus.onclick = () => {
        changeEditorFontSize(1);
    };

    el.edCancel.onclick = handleCancel;
    el.edSave.onclick = handleSave;
}

export function scrollEditorToLine(lineNumber) {
    if (!cmView) return;
    try {
        const targetLine = Math.max(1, Math.min(lineNumber, cmView.state.doc.lines));
        const line = cmView.state.doc.line(targetLine);
        cmView.dispatch({
            effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 20 })
        });
        requestAnimationFrame(() => {
            scrollPreviewToEditorLine(targetLine);
            requestAnimationFrame(() => {
                scrollPreviewToEditorLine(targetLine);
            });
        });
    } catch (e) {
        console.warn('Failed to scroll editor to line:', lineNumber, e);
    }
}
