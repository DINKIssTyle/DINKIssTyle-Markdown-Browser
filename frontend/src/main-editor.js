/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { DEFAULT_CONTENT_FONT_SIZE, DEFAULT_TRANSLATION_LANGUAGE_CODES, EDITOR_FONT_VISUAL_SCALE, TRANSLATION_LANGUAGES, getSlashCommands as getConfiguredSlashCommands } from './config.js';
import { state, el, getPathDirname, basename, deriveTabTitle, formatSaveDialogMessage, debounce, escapeHTML, escapeAttr } from './main-state.js';
import { updateNavButtons, openPath } from './main-navigation.js';
import { getActiveTab, renderTabs } from './main-tabs.js';
import { renderActiveTab, renderMarkdown, queueEditorPreviewRender, scrollPreviewToEditorLine, scrollPreviewToEditorLines, hideLinkTooltip } from './main-render.js';
import { beginProgressTask, finishProgressTask, isProgressTaskActive, showToast, updateProgress, hideProgress, showProgressDelta } from './main-ui.js';
import { persistAppSettings } from './main-settings.js';
import { SaveFile, AskConfirm, SelectDocument, SelectImage, GetRelativePath, ShowSaveFileDialog, SyncEditorState, GetTranslationTargets, TranslateDocumentCopies, SpellCheckDocument } from '../wailsjs/go/app/App';
import { EventsOn, LogError } from '../wailsjs/runtime/runtime';

import { EditorState, EditorSelection, Compartment, Prec, StateEffect, StateField, Transaction } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder, drawSelection, dropCursor, Decoration } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { SearchCursor } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { oneDark } from '@codemirror/theme-one-dark';
import { ghostTextField, hidePromptBox, showAskAIPrompt, showPromptBoxAtSelection, syncAIControls } from './main-ai.js';

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
let translationProgressEventsBound = false;
let lastRenderedPreviewContent = "";
let plainClickSelectionState = null;
let spellcheckTooltip = null;
let spellcheckCloseButton = null;
let spellcheckNavigator = null;
let spellcheckInProgress = false;
let activeSpellcheckSuggestionId = null;
let spellcheckTooltipHideTimer = 0;
let spellcheckTooltipPositionFrame = 0;
let toolbarDisabledTooltip = null;
let toolbarDisabledTooltipButton = null;
export let cmView = null;
export const themeCompartment = new Compartment();
export const tokenColorCompartment = new Compartment();
const historyCompartment = new Compartment();

const TRANSLATION_LANGUAGE_STORAGE_KEY = 'dkst.translation.languages';
const SPELLCHECK_LANGUAGE_STORAGE_KEY = 'dkst.spellcheck.language';
const LIVE_TAB_TITLE_CONTENT_LIMIT = 8192;

function isCancelledAIError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('context canceled') || message.includes('context cancelled') || message.includes('canceled');
}
const SPELLCHECK_CHUNK_TARGET_LENGTH = 700;
const SPELLCHECK_CHUNK_MAX_LENGTH = 1000;
const SPELLCHECK_COORDINATE_RECOVERY_RADIUS = 360;
const SPELLCHECK_SCROLL_MARGIN = 220;
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

const setSpellcheckSuggestionsEffect = StateEffect.define();
const removeSpellcheckSuggestionEffect = StateEffect.define();

function buildSpellcheckDecorations(suggestions, docLength = cmView?.state.doc.length || 0) {
    const marks = [];
    for (const suggestion of suggestions || []) {
        if (!suggestion || suggestion.start < 0 || suggestion.end <= suggestion.start || suggestion.end > docLength) {
            continue;
        }
        marks.push(Decoration.mark({
            class: 'cm-spellcheck-marker',
            attributes: {
                'data-spellcheck-id': suggestion.id,
            }
        }).range(suggestion.start, suggestion.end));
    }
    return Decoration.set(marks, true);
}

const spellcheckField = StateField.define({
    create() {
        return {
            suggestions: [],
            decorations: Decoration.none,
        };
    },
    update(value, tr) {
        let suggestions = value.suggestions;
        if (tr.docChanged) {
            suggestions = suggestions
                .map(suggestion => ({
                    ...suggestion,
                    start: tr.changes.mapPos(suggestion.start, 1),
                    end: tr.changes.mapPos(suggestion.end, -1),
                }))
                .filter(suggestion => suggestion.end > suggestion.start);
        }
        for (const effect of tr.effects) {
            if (effect.is(setSpellcheckSuggestionsEffect)) {
                suggestions = effect.value || [];
            } else if (effect.is(removeSpellcheckSuggestionEffect)) {
                suggestions = suggestions.filter(suggestion => suggestion.id !== effect.value);
            }
        }
        return {
            suggestions,
            decorations: buildSpellcheckDecorations(suggestions, tr.newDoc.length),
        };
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations),
});

const HTML_VOID_TAGS = [
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
];
const HTML_VOID_TAG_CLOSE_REGEX = new RegExp(`(<(${HTML_VOID_TAGS.join('|')})\\b[^<>]*?>)<\\/\\2\\s*>`, 'gi');
const EDITOR_TOOLBAR_MODES = Object.freeze(['beginner', 'rookie', 'pro']);
const TOOLBAR_COLLAPSED_BUTTON_IDS = Object.freeze([
    'ed-heading-menu',
    'ed-list-menu',
    'ed-insert-menu',
    'ed-more-menu',
    'ed-render-mode-menu',
    'ed-toolbar-hidden',
]);
const TOOLBAR_DIRECT_TOOL_IDS = Object.freeze([
    'ed-find-replace',
    'ed-spellcheck',
    'ed-translate-doc',
    'ed-bold',
    'ed-italic',
    'ed-underline',
    'ed-strike',
    'ed-quote',
    'ed-h1',
    'ed-h2',
    'ed-h3',
    'ed-ul',
    'ed-ol',
    'ed-hr',
    'ed-link',
    'ed-image',
    'ed-code',
    'ed-table',
    'ed-div',
    'ed-task',
    'ed-latex',
    'ed-emoji',
    'ed-font-minus',
    'ed-font-plus',
    'ed-cancel',
    'ed-save-as',
    'ed-save',
]);
const TOOLBAR_MODE_CONFIG = Object.freeze({
    beginner: Object.freeze({
        show: [
            ...TOOLBAR_DIRECT_TOOL_IDS,
            'ed-render-mode-menu',
        ],
        hide: [
            'ed-heading-menu',
            'ed-list-menu',
            'ed-insert-menu',
            'ed-more-menu',
            'ed-toolbar-hidden',
        ],
        showRenderSelect: false,
        showRenderLabel: false,
    }),
    rookie: Object.freeze({
        show: [
            'ed-find-replace',
            'ed-spellcheck',
            'ed-translate-doc',
            'ed-bold',
            'ed-italic',
            'ed-underline',
            'ed-strike',
            'ed-quote',
            'ed-heading-menu',
            'ed-list-menu',
            'ed-hr',
            'ed-insert-menu',
            'ed-more-menu',
            'ed-render-mode-menu',
            'ed-font-minus',
            'ed-font-plus',
            'ed-cancel',
            'ed-save-as',
            'ed-save',
        ],
        hide: [
            'ed-h1',
            'ed-h2',
            'ed-h3',
            'ed-ul',
            'ed-ol',
            'ed-link',
            'ed-image',
            'ed-code',
            'ed-table',
            'ed-div',
            'ed-task',
            'ed-latex',
            'ed-emoji',
            'ed-toolbar-hidden',
        ],
        showRenderSelect: false,
        showRenderLabel: false,
    }),
    pro: Object.freeze({
        show: [
            'ed-find-replace',
            'ed-spellcheck',
            'ed-translate-doc',
            'ed-bold',
            'ed-italic',
            'ed-underline',
            'ed-strike',
            'ed-quote',
            'ed-toolbar-hidden',
            'ed-render-mode-menu',
            'ed-font-minus',
            'ed-font-plus',
            'ed-cancel',
            'ed-save-as',
            'ed-save',
        ],
        hide: [
            'ed-h1',
            'ed-h2',
            'ed-h3',
            'ed-heading-menu',
            'ed-ul',
            'ed-ol',
            'ed-list-menu',
            'ed-hr',
            'ed-link',
            'ed-image',
            'ed-code',
            'ed-table',
            'ed-div',
            'ed-insert-menu',
            'ed-task',
            'ed-latex',
            'ed-emoji',
            'ed-more-menu',
        ],
        showRenderSelect: false,
        showRenderLabel: false,
    }),
});
const TOOLBAR_POPUP_GROUPS = Object.freeze({
    heading: Object.freeze([
        { label: 'H1', description: 'Heading 1 (#)', action: () => applyBlockMarker('h1') },
        { label: 'H2', description: 'Heading 2 (##)', action: () => applyBlockMarker('h2') },
        { label: 'H3', description: 'Heading 3 (###)', action: () => applyBlockMarker('h3') },
        { label: 'H4', description: 'Heading 4 (####)', action: () => applyBlockMarker('h4') },
    ]),
    list: Object.freeze([
        { label: 'Unordered List', icon: 'format_list_bulleted', action: () => applyBlockMarker('ul') },
        { label: 'Ordered List', icon: 'format_list_numbered', action: () => applyBlockMarker('ol') },
    ]),
    insert: Object.freeze([
        { label: 'Link', icon: 'link', action: () => insertLink() },
        { label: 'Image', icon: 'image', action: () => insertImage() },
        { label: 'Code Block', icon: 'code', action: () => insertCodeBlock() },
        { label: 'Table', icon: 'table_chart', action: () => insertTable() },
        { label: 'DIV Wrapper', icon: 'border_inner', action: () => insertDivWrapper() },
    ]),
    more: Object.freeze([
        { label: 'Task List', icon: 'checklist', action: () => applyBlockMarker('task') },
        { label: 'LaTeX', icon: 'functions', action: () => insertLatex() },
        { label: 'Emoji', icon: 'mood', action: () => insertEmoji() },
    ]),
    renderMode: Object.freeze([
        { label: 'Realtime', description: 'Render while typing', icon: 'autoplay', value: 'realtime' },
        { label: 'Line Change', description: 'Render after line changes', icon: 'autopause', value: 'cursor-line-change' },
    ]),
});
let toolbarPopup = null;
let toolbarPopupTrigger = null;
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
    state.editorToolbarMode = normalizeEditorToolbarMode(settings.editorToolbarMode);
    state.editorPreviewScrollSyncEnabled = settings.editorPreviewScrollSync !== false;
    state.editorOrderedListStyle = settings.editorOrderedListStyle === 'incremental' ? 'incremental' : 'standard';
    state.editorTokenColorsEnabled = settings.editorTokenColorsEnabled !== false;
    state.editorTokenColors = normalizeTokenColors(settings.editorTokenColors || {});
    state.editorBackgroundColor = normalizeBackgroundColor(settings.editorBackgroundColor);
    applyEditorToolbarMode();
    applyEditorTokenColors();
    applyEditorBackgroundColor();
}

function normalizeEditorToolbarMode(mode) {
    return EDITOR_TOOLBAR_MODES.includes(mode) ? mode : 'beginner';
}

function getToolbarElement(id) {
    return document.getElementById(id);
}

function syncToolbarGroupVisibility() {
    el.editToolbar?.querySelectorAll('.edit-tool-group').forEach(group => {
        const visibleItems = [...group.children].filter(child => {
            if (child.classList?.contains('hidden')) return false;
            if (child.tagName === 'LABEL' && child.classList.contains('hidden')) return false;
            return child.offsetParent !== null || !child.classList?.contains('hidden');
        });
        group.classList.toggle('hidden', visibleItems.length === 0);
    });

    el.editToolbar?.querySelectorAll('.edit-separator').forEach(separator => {
        const previousGroup = separator.previousElementSibling;
        const nextGroup = separator.nextElementSibling;
        const shouldShow = previousGroup?.classList?.contains('edit-tool-group')
            && nextGroup?.classList?.contains('edit-tool-group')
            && !previousGroup.classList.contains('hidden')
            && !nextGroup.classList.contains('hidden');
        separator.classList.toggle('hidden', !shouldShow);
    });
}

function syncRenderModeIcon() {
    if (!el.edRenderModeIcon) return;
    const isRealtime = state.currentEditorRenderMode !== 'cursor-line-change';
    el.edRenderModeIcon.textContent = isRealtime ? 'autoplay' : 'autopause';
    if (el.edRenderModeMenu) {
        el.edRenderModeMenu.title = isRealtime ? 'Realtime' : 'Line Change';
        el.edRenderModeMenu.setAttribute('aria-label', el.edRenderModeMenu.title);
    }
}

function updateActiveTabTitleFromContent(content) {
    const tab = getActiveTab();
    if (!tab) return false;
    const titlePath = state.editingSourcePath || state.currentFilePath || tab.path;
    const nextTitle = deriveTabTitle(titlePath, content, { maxContentLength: LIVE_TAB_TITLE_CONTENT_LIMIT });
    if (tab.title === nextTitle) return false;
    tab.title = nextTitle;
    return true;
}

export function applyEditorToolbarMode() {
    const mode = normalizeEditorToolbarMode(state.editorToolbarMode);
    state.editorToolbarMode = mode;
    const config = TOOLBAR_MODE_CONFIG[mode];
    const shown = new Set(config.show);
    const managedIds = new Set([...TOOLBAR_DIRECT_TOOL_IDS, ...TOOLBAR_COLLAPSED_BUTTON_IDS]);

    managedIds.forEach(id => {
        getToolbarElement(id)?.classList.toggle('hidden', !shown.has(id));
    });

    config.hide.forEach(id => getToolbarElement(id)?.classList.add('hidden'));
    el.edRenderMode?.classList.toggle('hidden', !config.showRenderSelect);
    el.edRenderMode?.previousElementSibling?.classList.toggle('hidden', !config.showRenderLabel);
    el.edRenderMode?.previousElementSibling?.previousElementSibling?.classList.toggle('hidden', !config.showRenderLabel);
    closeToolbarPopup();
    syncRenderModeIcon();
    requestAnimationFrame(syncToolbarGroupVisibility);
}

function closeToolbarPopup() {
    toolbarPopup?.remove();
    toolbarPopup = null;
    toolbarPopupTrigger?.setAttribute('aria-expanded', 'false');
    toolbarPopupTrigger = null;
}

function buildToolbarPopupItem(item, index, selectedValue = '') {
    const active = item.value && item.value === selectedValue ? ' active' : '';
    const description = item.description ? `<span>${escapeHTML(item.description)}</span>` : '';
    const icon = item.icon ? `<span class="material-symbols-outlined toolbar-popup-icon" aria-hidden="true">${escapeHTML(item.icon)}</span>` : '';
    return `
        <button class="toolbar-popup-item${active}" type="button" data-toolbar-popup-index="${index}">
            ${icon}
            <span class="toolbar-popup-copy">
                <strong>${escapeHTML(item.label)}</strong>
                ${description}
            </span>
        </button>
    `;
}

function openToolbarPopup(trigger, groupKey) {
    const items = TOOLBAR_POPUP_GROUPS[groupKey] || [];
    if (!trigger || !items.length) return;
    if (toolbarPopup && toolbarPopupTrigger === trigger) {
        closeToolbarPopup();
        return;
    }

    closeToolbarPopup();
    const selectedValue = groupKey === 'renderMode' ? state.currentEditorRenderMode : '';
    const popup = document.createElement('div');
    popup.className = 'toolbar-popup';
    popup.setAttribute('role', 'menu');
    popup.innerHTML = items.map((item, index) => buildToolbarPopupItem(item, index, selectedValue)).join('');
    document.body.appendChild(popup);

    const triggerRect = trigger.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const left = Math.min(
        window.innerWidth - popupRect.width - 10,
        Math.max(10, triggerRect.left + (triggerRect.width / 2) - (popupRect.width / 2))
    );
    const top = Math.max(10, triggerRect.bottom + 8);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    popup.addEventListener('click', event => {
        const button = event.target.closest('[data-toolbar-popup-index]');
        if (!button) return;
        const item = items[Number(button.dataset.toolbarPopupIndex)];
        closeToolbarPopup();
        if (item.value) {
            void setEditorRenderMode(item.value);
            return;
        }
        item.action?.();
    });

    toolbarPopup = popup;
    toolbarPopupTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
}

async function setEditorRenderMode(mode) {
    state.currentEditorRenderMode = mode === 'cursor-line-change' ? 'cursor-line-change' : 'realtime';
    if (el.edRenderMode) {
        el.edRenderMode.value = state.currentEditorRenderMode;
    }
    syncRenderModeIcon();
    lastPreviewCursorLine = getCursorLineNumber(cmView?.state);
    schedulePreviewRender(getCurrentEditorText(), 0);
    await persistEditorPreferences();
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

export function getEditorStateSnapshot() {
    return cmView?.state || null;
}

export function isEditorFocused() {
    if (!cmView?.contentDOM) return false;
    const activeElement = document.activeElement;
    return activeElement === cmView.contentDOM || cmView.contentDOM.contains(activeElement);
}

export function focusEditor() {
    cmView?.focus();
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

function resetEditorHistoryAroundSync(applySync) {
    if (!cmView) return;
    cmView.dispatch({ effects: historyCompartment.reconfigure([]) });
    applySync();
    cmView.dispatch({ effects: historyCompartment.reconfigure(history()) });
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

export function getEditorSelectionSnapshot() {
    if (!cmView || !state.isEditing) {
        return null;
    }
    const selection = cmView.state.selection.main;
    return {
        anchor: selection.anchor,
        head: selection.head,
    };
}

function normalizeEditorSelectionSnapshot(snapshot, docLength) {
    if (!snapshot || typeof snapshot.anchor !== 'number' || typeof snapshot.head !== 'number') {
        return { anchor: 0, head: 0 };
    }
    const clamp = value => Math.max(0, Math.min(docLength, Math.round(value)));
    return {
        anchor: clamp(snapshot.anchor),
        head: clamp(snapshot.head),
    };
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

function bindTranslationProgressEvents() {
    if (translationProgressEventsBound) return;
    translationProgressEventsBound = true;

    EventsOn('translation:progress', (data) => {
        const progress = Math.round(Number(data?.progress) || 0);
        updateProgress(data?.label || 'Translating document...', progress, { active: data?.active !== false });
        if (data?.completed) {
            hideProgress();
        }
    });

    EventsOn('progress:delta', (data) => {
        showProgressDelta(data?.text || "");
    });
}

function getStoredTranslationLanguageCodes() {
    try {
        const stored = localStorage.getItem(TRANSLATION_LANGUAGE_STORAGE_KEY);
        if (stored !== null) {
            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) {
                return [...DEFAULT_TRANSLATION_LANGUAGE_CODES];
            }
            return parsed.filter(code => TRANSLATION_LANGUAGES.some(language => language.code === code));
        }
    } catch {
        // Ignore malformed user storage and fall back to defaults.
    }
    return [...DEFAULT_TRANSLATION_LANGUAGE_CODES];
}

function storeTranslationLanguageCodes(codes) {
    localStorage.setItem(TRANSLATION_LANGUAGE_STORAGE_KEY, JSON.stringify(codes));
}

function getOrderedTranslationLanguageCodes(selectedCodes) {
    return TRANSLATION_LANGUAGES
        .filter(language => selectedCodes.has(language.code))
        .map(language => language.code);
}

function showTranslationLanguagePrompt() {
    return new Promise((resolve) => {
        const selectedCodes = new Set(getStoredTranslationLanguageCodes());
        const modalContent = el.modalOverlay.querySelector('.modal-content');
        let filterText = "";
        let isComposingFilterText = false;
        let filterInput = null;
        let languageList = null;

        const renderLanguageList = () => {
            const query = filterText.trim().toLowerCase();
            const filtered = TRANSLATION_LANGUAGES.filter(language => {
                const haystack = `${language.name} ${language.nativeName} ${language.code}`.toLowerCase();
                return !query || haystack.includes(query);
            });
            languageList.innerHTML = filtered.length
                ? filtered.map(language => `
                    <label class="language-option">
                        <input type="checkbox" value="${escapeAttr(language.code)}" ${selectedCodes.has(language.code) ? 'checked' : ''} />
                        <span class="language-option-name">
                            ${escapeHTML(language.name)} (${escapeHTML(language.nativeName)})
                            <span class="language-option-code">${escapeHTML(language.code)}</span>
                        </span>
                    </label>
                `).join('')
                : '<div class="language-empty">No languages found.</div>';
        };

        const mountLanguagePicker = () => {
            el.modalLanguageContainer.innerHTML = `
                <input type="text" class="language-filter-input" placeholder="Filter languages..." autocomplete="off" spellcheck="false" />
                <div class="language-list"></div>
            `;

            filterInput = el.modalLanguageContainer.querySelector('.language-filter-input');
            languageList = el.modalLanguageContainer.querySelector('.language-list');

            filterInput?.addEventListener('compositionstart', () => {
                isComposingFilterText = true;
            });
            filterInput?.addEventListener('compositionend', event => {
                isComposingFilterText = false;
                filterText = event.target.value || "";
                renderLanguageList();
            });
            filterInput?.addEventListener('input', event => {
                if (isComposingFilterText || event.isComposing) return;
                filterText = event.target.value || "";
                renderLanguageList();
            });

            languageList?.addEventListener('change', event => {
                const input = event.target.closest('input[type="checkbox"]');
                if (!input) return;
                const code = input.value;
                if (input.checked) selectedCodes.add(code);
                else selectedCodes.delete(code);
                storeTranslationLanguageCodes(getOrderedTranslationLanguageCodes(selectedCodes));
            });

            renderLanguageList();
        };

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            modalContent?.classList.remove('language-picker-modal');
            el.modalLanguageContainer.classList.add('hidden');
            el.modalBtnOk.removeEventListener('click', handleOk);
            el.modalBtnCancel.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleKey, true);
        };

        const handleOk = () => {
            const selected = TRANSLATION_LANGUAGES.filter(language => selectedCodes.has(language.code));
            cleanup();
            storeTranslationLanguageCodes(selected.map(language => language.code));
            resolve(selected);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const getLanguageCheckboxes = () => Array.from(el.modalLanguageContainer.querySelectorAll('input[type="checkbox"]'));

        const focusLanguageCheckbox = index => {
            const checkboxes = getLanguageCheckboxes();
            if (!checkboxes.length) return;
            const boundedIndex = (index + checkboxes.length) % checkboxes.length;
            checkboxes[boundedIndex]?.focus();
        };

        const focusFirstLanguageCheckbox = () => {
            const checkboxes = getLanguageCheckboxes();
            const firstCheckedIndex = checkboxes.findIndex(input => input.checked);
            focusLanguageCheckbox(firstCheckedIndex >= 0 ? firstCheckedIndex : 0);
        };

        const handleKey = event => {
            if (!el.modalOverlay || el.modalOverlay.classList.contains('hidden')) return;
            if (isComposingFilterText || event.isComposing) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel();
                return;
            }

            const checkboxes = getLanguageCheckboxes();
            const active = document.activeElement;
            const checkboxIndex = checkboxes.indexOf(active);

            if (event.key === 'Tab') {
                if (active === filterInput && !event.shiftKey) {
                    event.preventDefault();
                    focusFirstLanguageCheckbox();
                    return;
                }
                if (checkboxIndex >= 0 && !event.shiftKey) {
                    event.preventDefault();
                    el.modalBtnOk.focus();
                    return;
                }
                if (checkboxIndex >= 0 && event.shiftKey) {
                    event.preventDefault();
                    filterInput?.focus();
                    return;
                }
                if (active === el.modalBtnOk && event.shiftKey) {
                    event.preventDefault();
                    focusLanguageCheckbox(checkboxes.length - 1);
                    return;
                }
            }

            if (['ArrowDown', 'ArrowRight'].includes(event.key) && checkboxes.length > 0) {
                event.preventDefault();
                focusLanguageCheckbox(checkboxIndex >= 0 ? checkboxIndex + 1 : 0);
                return;
            }
            if (['ArrowUp', 'ArrowLeft'].includes(event.key) && checkboxes.length > 0) {
                event.preventDefault();
                focusLanguageCheckbox(checkboxIndex >= 0 ? checkboxIndex - 1 : checkboxes.length - 1);
                return;
            }
            if (event.key === 'Home' && checkboxes.length > 0) {
                event.preventDefault();
                focusLanguageCheckbox(0);
                return;
            }
            if (event.key === 'End' && checkboxes.length > 0) {
                event.preventDefault();
                focusLanguageCheckbox(checkboxes.length - 1);
                return;
            }
            if (event.key === ' ' && checkboxIndex >= 0) {
                event.preventDefault();
                const input = checkboxes[checkboxIndex];
                input.checked = !input.checked;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                handleOk();
                return;
            }
        };

        el.modalTitle.textContent = "Translate Document";
        el.modalMessage.textContent = "";
        modalContent?.classList.add('language-picker-modal');
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.add('hidden');
        el.modalEmojiContainer.classList.add('hidden');
        el.modalTableContainer.classList.add('hidden');
        el.modalLanguageContainer.classList.remove('hidden');
        el.modalBtnOk.classList.remove('hidden');
        mountLanguagePicker();
        el.modalOverlay.classList.remove('hidden');

        el.modalBtnOk.addEventListener('click', handleOk);
        el.modalBtnCancel.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleKey, true);
        setTimeout(() => filterInput?.focus(), 50);
    });
}

function isUsableMarkdownSourcePath(path) {
    return !!path && path !== '__home__' && /\.(md|markdown)$/i.test(path);
}

async function ensureDocumentReadyForTranslation() {
    if (!cmView || !state.isEditing) {
        showToast("Open a Markdown document in edit mode first.");
        return null;
    }

    let sourcePath = state.editingSourcePath || state.currentFilePath || "";
    if (!isUsableMarkdownSourcePath(sourcePath)) {
        const saved = await saveCurrentDocumentAs();
        if (!saved) return null;
        sourcePath = state.editingSourcePath || state.currentFilePath || "";
    }
    if (!isUsableMarkdownSourcePath(sourcePath)) {
        showToast("Save this document as Markdown before translating.");
        return null;
    }

    if (hasUnsavedEditorChanges()) {
        const ok = await AskConfirm("Save Before Translation", "Save the current document before creating translated copies?", "Save", "Cancel");
        if (!ok) return null;
        const saved = await saveCurrentDocument({ confirm: false, exitAfterSave: false });
        if (!saved) return null;
    }

    return {
        sourcePath,
        content: getCurrentEditorText(),
    };
}

function getTranslationAIConfig() {
    const aiState = window.aiState || {};
    if (state.aiFeaturesDisabled || aiState.generalAvailable === false) {
        return { error: "General AI is disabled in AI Settings." };
    }
    const endpoint = String(aiState.generalEndpoint || "").trim();
    const model = String(aiState.generalModel || "").trim();
    if (!endpoint || !model) {
        return { error: "Set a General AI endpoint and model before translating." };
    }
    return {
        provider: aiState.generalProvider || "openai",
        endpoint,
        model,
        key: aiState.generalKey || "",
        temperature: Number(aiState.generalTemp) || 0,
    };
}

async function insertTranslatedDocumentLinks(sourcePath, targets) {
    const lines = [];
    for (const target of targets) {
        const relPath = await GetRelativePath(sourcePath, target.path);
        const title = target.nativeName && target.nativeName !== target.name
            ? `${target.name} (${target.nativeName})`
            : target.name;
        lines.push(`[${title}](${formatMarkdownDestination(relPath)})`);
    }
    if (lines.length === 0) return;
    insertPlainTextAtCursor(`${lines.join('\n')}\n`);
    renderMarkdown(getCurrentEditorText());
    cmView?.focus();
}

async function translateCurrentDocument() {
    const selectedLanguages = await showTranslationLanguagePrompt();
    if (!selectedLanguages || selectedLanguages.length === 0) {
        return;
    }

    const ready = await ensureDocumentReadyForTranslation();
    if (!ready) return;

    const aiConfig = getTranslationAIConfig();
    if (aiConfig.error) {
        showToast(aiConfig.error, "error", 3200);
        return;
    }

    try {
        const targets = await GetTranslationTargets(ready.sourcePath, selectedLanguages);
        const existing = targets.filter(target => target.exists);
        if (existing.length > 0) {
            const message = `These translated files already exist:\n\n${existing.map(target => target.fileName).join('\n')}\n\nOverwrite them?`;
            const overwrite = await AskConfirm("Overwrite Translations", message, "Overwrite", "Cancel");
            if (!overwrite) return;
        }

        const taskId = beginProgressTask("Starting translation...", 0);
        const result = await TranslateDocumentCopies({
            sourcePath: ready.sourcePath,
            content: ready.content,
            languages: selectedLanguages,
            ai: aiConfig,
            overwriteExisting: existing.length > 0,
        });
        if (!isProgressTaskActive(taskId)) return;
        const sidebar = await import('./main-sidebar.js');
        await sidebar.updateFileTree({ forceRefresh: true });
        await insertTranslatedDocumentLinks(ready.sourcePath, result.targets || []);
        showToast("Translated documents created.", "check_circle");
        finishProgressTask(taskId);
    } catch (error) {
        if (isCancelledAIError(error)) {
            LogError(`TranslateDocumentCopies cancelled: ${error?.message || error}`);
            return;
        }
        LogError(`TranslateDocumentCopies failed: ${error?.message || error}`);
        showToast(error?.message || "Failed to translate document.", "error", 4200);
    } finally {
        hideProgress();
    }
}

function getStoredSpellcheckLanguageCode() {
    try {
        const stored = localStorage.getItem(SPELLCHECK_LANGUAGE_STORAGE_KEY);
        if (stored === 'auto' || TRANSLATION_LANGUAGES.some(language => language.code === stored)) {
            return stored;
        }
    } catch {
        // Ignore malformed user storage and fall back to auto detection.
    }
    return 'auto';
}

function showSpellcheckLanguagePrompt() {
    return new Promise((resolve) => {
        const modalContent = el.modalOverlay.querySelector('.modal-content');
        const languageItems = [
            { code: 'auto', name: 'Auto Detect', nativeName: 'Language auto detection', auto: true },
            ...TRANSLATION_LANGUAGES.map(language => ({ ...language, auto: false })),
        ];
        let selectedCode = getStoredSpellcheckLanguageCode();

        const renderLanguageList = () => {
            el.modalLanguageContainer.innerHTML = `
                <div class="spellcheck-language-list" role="listbox" aria-label="Spellcheck language">
                    ${languageItems.map(item => `
                        <label class="language-option spellcheck-language-option" data-language-code="${escapeAttr(item.code)}">
                            <input type="radio" name="spellcheck-language" value="${escapeAttr(item.code)}" ${item.code === selectedCode ? 'checked' : ''} />
                            <span class="language-option-name">
                                ${escapeHTML(item.name)}${item.nativeName ? ` (${escapeHTML(item.nativeName)})` : ''}
                                ${item.code !== 'auto' ? `<span class="language-option-code">${escapeHTML(item.code)}</span>` : ''}
                            </span>
                        </label>
                    `).join('')}
                </div>
            `;
        };

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            modalContent?.classList.remove('language-picker-modal', 'spellcheck-language-modal');
            el.modalLanguageContainer.classList.add('hidden');
            el.modalBtnOk.textContent = 'OK';
            el.modalBtnOk.removeEventListener('click', handleOk);
            el.modalBtnCancel.removeEventListener('click', handleCancel);
            el.modalLanguageContainer.removeEventListener('change', handleChange);
            el.modalLanguageContainer.removeEventListener('keydown', handleLanguageKeydown);
            document.removeEventListener('keydown', handleKey, true);
        };

        const handleOk = () => {
            const selected = languageItems.find(item => item.code === selectedCode) || languageItems[0];
            cleanup();
            localStorage.setItem(SPELLCHECK_LANGUAGE_STORAGE_KEY, selected.code);
            resolve(selected);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const handleKey = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel();
            }
            if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                const active = document.activeElement;
                if (active?.matches?.('input[type="radio"], .spellcheck-language-option')) {
                    event.preventDefault();
                    handleOk();
                }
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                handleOk();
            }
        };

        const handleChange = event => {
            const input = event.target.closest('input[type="radio"]');
            if (!input) return;
            selectedCode = input.value;
        };

        const focusSpellcheckLanguage = index => {
            const radios = Array.from(el.modalLanguageContainer.querySelectorAll('input[type="radio"]'));
            if (!radios.length) return;
            const boundedIndex = (index + radios.length) % radios.length;
            const radio = radios[boundedIndex];
            radio.checked = true;
            selectedCode = radio.value;
            radio.focus();
        };

        const handleLanguageKeydown = event => {
            const radios = Array.from(el.modalLanguageContainer.querySelectorAll('input[type="radio"]'));
            if (!radios.length) return;
            const currentIndex = Math.max(0, radios.indexOf(document.activeElement));
            if (['ArrowDown', 'ArrowRight'].includes(event.key)) {
                event.preventDefault();
                focusSpellcheckLanguage(currentIndex + 1);
            } else if (['ArrowUp', 'ArrowLeft'].includes(event.key)) {
                event.preventDefault();
                focusSpellcheckLanguage(currentIndex - 1);
            } else if (event.key === 'Home') {
                event.preventDefault();
                focusSpellcheckLanguage(0);
            } else if (event.key === 'End') {
                event.preventDefault();
                focusSpellcheckLanguage(radios.length - 1);
            } else if (event.key === ' ') {
                const active = document.activeElement;
                if (active?.matches?.('input[type="radio"]')) {
                    event.preventDefault();
                    active.checked = true;
                    selectedCode = active.value;
                }
            } else if (event.key === 'Enter') {
                event.preventDefault();
                handleOk();
            }
        };

        el.modalTitle.textContent = "Spellcheck";
        el.modalMessage.textContent = "";
        modalContent?.classList.add('language-picker-modal', 'spellcheck-language-modal');
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.add('hidden');
        el.modalEmojiContainer.classList.add('hidden');
        el.modalTableContainer.classList.add('hidden');
        el.modalLanguageContainer.classList.remove('hidden');
        el.modalBtnOk.textContent = 'Start';
        el.modalBtnOk.classList.remove('hidden');
        renderLanguageList();
        el.modalOverlay.classList.remove('hidden');

        el.modalBtnOk.addEventListener('click', handleOk);
        el.modalBtnCancel.addEventListener('click', handleCancel);
        el.modalLanguageContainer.addEventListener('change', handleChange);
        el.modalLanguageContainer.addEventListener('keydown', handleLanguageKeydown);
        document.addEventListener('keydown', handleKey, true);
        setTimeout(() => {
            el.modalLanguageContainer.querySelector(`input[type="radio"][value="${CSS.escape(selectedCode)}"]`)?.focus();
        }, 50);
    });
}

function getSpellcheckAIConfig() {
    const aiConfig = getTranslationAIConfig();
    if (aiConfig.error) {
        return { error: aiConfig.error.replace('translating', 'spellchecking') };
    }
    return aiConfig;
}

function splitOversizedSpellcheckBlock(block) {
    if (block.content.length <= SPELLCHECK_CHUNK_MAX_LENGTH) {
        return [block];
    }

    const pieces = [];
    let start = 0;
    while (start < block.content.length) {
        const maxEnd = Math.min(block.content.length, start + SPELLCHECK_CHUNK_MAX_LENGTH);
        if (maxEnd >= block.content.length) {
            pieces.push({ start: block.start + start, content: block.content.slice(start) });
            break;
        }

        const windowStart = Math.min(block.content.length, start + SPELLCHECK_CHUNK_TARGET_LENGTH);
        const windowText = block.content.slice(windowStart, maxEnd);
        let relativeCut = -1;
        for (const boundary of ['\n', '. ', '.\n', '? ', '?\n', '! ', '!\n', '。', '؟ ']) {
            const index = windowText.lastIndexOf(boundary);
            if (index > relativeCut) {
                relativeCut = index + boundary.length;
            }
        }

        const end = relativeCut > 0 ? windowStart + relativeCut : maxEnd;
        pieces.push({ start: block.start + start, content: block.content.slice(start, end) });
        start = end;
    }
    return pieces.filter(piece => piece.content.trim());
}

function createSpellcheckBlocks(content) {
    const blocks = [];
    const blockRegex = /(?:^|\n)(?:#{1,6}\s.+(?:\n+|$)|```[\s\S]*?(?:```|$)|(?:[-*+]\s.+(?:\n|$))+|(?:\d+\.\s.+(?:\n|$))+|(?:>\s?.+(?:\n|$))+|(?:\|.*\|(?:\n|$))+|[^\n]+(?:\n(?!\n)[^\n]+)*)(?:\n*)/g;
    let match;

    while ((match = blockRegex.exec(content)) !== null) {
        const raw = match[0];
        const leadingNewline = raw.startsWith('\n') ? 1 : 0;
        const blockContent = raw.slice(leadingNewline);
        if (!blockContent.trim()) continue;
        blocks.push({
            start: match.index + leadingNewline,
            content: blockContent,
        });
    }

    return blocks.flatMap(splitOversizedSpellcheckBlock);
}

function createSpellcheckChunks(content) {
    const blocks = createSpellcheckBlocks(content);
    if (blocks.length === 0) return [];

    const chunks = [];
    let current = null;

    for (const block of blocks) {
        if (!current) {
            current = { start: block.start, content: block.content };
            continue;
        }

        const gap = content.slice(current.start + current.content.length, block.start);
        const candidate = `${current.content}${gap}${block.content}`;
        const currentIsHeadingOnly = /^#{1,6}\s.+\s*$/.test(current.content.trim());
        const shouldAttachToHeading = currentIsHeadingOnly && candidate.length <= SPELLCHECK_CHUNK_MAX_LENGTH;

        if (candidate.length <= SPELLCHECK_CHUNK_TARGET_LENGTH || shouldAttachToHeading) {
            current.content = candidate;
            continue;
        }

        chunks.push(current);
        current = { start: block.start, content: block.content };
    }

    if (current) chunks.push(current);

    return chunks.flatMap(chunk => {
        if (chunk.content.length <= SPELLCHECK_CHUNK_MAX_LENGTH) {
            return [chunk];
        }
        return splitOversizedSpellcheckBlock(chunk);
    }).map(chunk => {
        let start = chunk.start;
        let text = chunk.content;
        while (text.length && /^\s$/.test(text[0])) {
            text = text.slice(1);
            start += 1;
        }
        while (text.length && /\s$/.test(text[text.length - 1])) {
            text = text.slice(0, -1);
        }
        return { start, content: text };
    }).filter(chunk => chunk.content.trim());
}

function findSpellcheckOriginalInChunk(content, original, startHint = 0) {
    if (!original) return -1;
    const exactAtHint = Number.isInteger(startHint) ? content.indexOf(original, Math.max(0, startHint)) : -1;
    if (exactAtHint >= 0 && Math.abs(exactAtHint - startHint) <= SPELLCHECK_COORDINATE_RECOVERY_RADIUS) {
        return exactAtHint;
    }

    if (Number.isInteger(startHint)) {
        const radiusStart = Math.max(0, startHint - SPELLCHECK_COORDINATE_RECOVERY_RADIUS);
        const radiusEnd = Math.min(content.length, startHint + SPELLCHECK_COORDINATE_RECOVERY_RADIUS + original.length);
        const nearbyIndex = content.slice(radiusStart, radiusEnd).indexOf(original);
        if (nearbyIndex >= 0) {
            return radiusStart + nearbyIndex;
        }
    }

    const matches = [];
    let index = content.indexOf(original);
    while (index >= 0) {
        matches.push(index);
        index = content.indexOf(original, index + original.length);
    }
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1 && Number.isInteger(startHint)) {
        return matches.reduce((best, next) => (
            Math.abs(next - startHint) < Math.abs(best - startHint) ? next : best
        ), matches[0]);
    }
    return -1;
}

function normalizeSpellcheckSuggestions(suggestions, content, offset = 0) {
    return (suggestions || [])
        .map((suggestion, index) => {
            const original = String(suggestion.original || '');
            const replacement = String(suggestion.replacement || '');
            let start = Number(suggestion.start);
            let end = Number(suggestion.end);
            if (!Number.isInteger(start) || !Number.isInteger(end) || content.slice(start, end) !== original) {
                const recoveredStart = findSpellcheckOriginalInChunk(content, original, start);
                if (recoveredStart >= 0) {
                    start = recoveredStart;
                    end = recoveredStart + original.length;
                }
            }
            return {
                id: `spell-${Date.now()}-${offset}-${index}`,
                tabId: state.activeTabId,
                original,
                replacement,
                reason: String(suggestion.reason || ''),
                start: start + offset,
                end: end + offset,
            };
        })
        .filter(suggestion => {
            const localStart = suggestion.start - offset;
            const localEnd = suggestion.end - offset;
            if (!Number.isInteger(localStart) || !Number.isInteger(localEnd)) return false;
            if (localStart < 0 || localEnd <= localStart || localEnd > content.length) return false;
            if (!suggestion.original || !suggestion.replacement || suggestion.original === suggestion.replacement) return false;
            return content.slice(localStart, localEnd) === suggestion.original;
        });
}

function mergeSpellcheckSuggestions(existing, incoming, currentContent) {
    const merged = [...existing];
    const occupied = new Set(existing.map(suggestion => `${suggestion.start}:${suggestion.end}:${suggestion.replacement}`));
    for (const suggestion of incoming) {
        if (currentContent.slice(suggestion.start, suggestion.end) !== suggestion.original) {
            continue;
        }
        const key = `${suggestion.start}:${suggestion.end}:${suggestion.replacement}`;
        if (occupied.has(key)) {
            continue;
        }
        occupied.add(key);
        merged.push(suggestion);
    }
    merged.sort((a, b) => a.start === b.start ? a.end - b.end : a.start - b.start);
    return merged;
}

function getSpellcheckState() {
    return cmView?.state.field(spellcheckField, false) || { suggestions: [] };
}

function getSpellcheckRequestTab(tabId) {
    return state.tabs.find(tab => tab.id === tabId) || null;
}

function getSpellcheckRequestState(tabId) {
    if (tabId === state.activeTabId && cmView) {
        return cmView.state;
    }
    return getSpellcheckRequestTab(tabId)?.editorState || null;
}

function getSpellcheckSuggestionsForTab(tabId) {
    return getSpellcheckRequestState(tabId)?.field(spellcheckField, false)?.suggestions || [];
}

function getSpellcheckContentForTab(tabId, fallbackContent = "") {
    const requestState = getSpellcheckRequestState(tabId);
    if (requestState) {
        return requestState.doc.toString();
    }
    return getSpellcheckRequestTab(tabId)?.currentMarkdownSource || fallbackContent;
}

function setSpellcheckSuggestionsForTab(tabId, suggestions) {
    if (tabId === state.activeTabId && cmView) {
        cmView.dispatch({ effects: setSpellcheckSuggestionsEffect.of(suggestions) });
        return true;
    }
    const requestTab = getSpellcheckRequestTab(tabId);
    if (!requestTab?.editorState) {
        return false;
    }
    const transaction = requestTab.editorState.update({
        effects: setSpellcheckSuggestionsEffect.of(suggestions),
    });
    requestTab.editorState = transaction.state;
    requestTab.currentMarkdownSource = transaction.state.doc.toString();
    return true;
}

export function isSpellcheckActive() {
    return spellcheckInProgress || getSpellcheckState().suggestions.length > 0;
}

function findSpellcheckSuggestion(id) {
    return getSpellcheckState().suggestions.find(suggestion => suggestion.id === id);
}

function getActiveSpellcheckIndex(suggestions = getSpellcheckState().suggestions) {
    if (!suggestions.length) return -1;
    const activeIndex = suggestions.findIndex(suggestion => suggestion.id === activeSpellcheckSuggestionId);
    if (activeIndex >= 0) return activeIndex;
    const pos = cmView?.state.selection.main.from ?? 0;
    const containingIndex = suggestions.findIndex(suggestion => suggestion.start <= pos && pos <= suggestion.end);
    if (containingIndex >= 0) return containingIndex;
    const nextIndex = suggestions.findIndex(suggestion => suggestion.start >= pos);
    return nextIndex >= 0 ? nextIndex : 0;
}

function updateSpellcheckNavigator() {
    const suggestions = getSpellcheckState().suggestions;
    if (!suggestions.length) {
        spellcheckNavigator?.remove();
        spellcheckNavigator = null;
        spellcheckCloseButton = null;
        return;
    }

    ensureSpellcheckCloseButton();
    const index = getActiveSpellcheckIndex(suggestions);
    const count = spellcheckNavigator?.querySelector('[data-spellcheck-count]');
    if (count) {
        count.textContent = `${index + 1} / ${suggestions.length}`;
    }
}

function focusSpellcheckSuggestion(index) {
    if (!cmView) return;
    const suggestions = getSpellcheckState().suggestions;
    if (!suggestions.length) {
        updateSpellcheckNavigator();
        return;
    }

    const normalizedIndex = ((index % suggestions.length) + suggestions.length) % suggestions.length;
    const suggestion = suggestions[normalizedIndex];
    cmView.dispatch({
        selection: { anchor: suggestion.start, head: suggestion.end },
        effects: EditorView.scrollIntoView(suggestion.start, {
            y: 'nearest',
            yMargin: SPELLCHECK_SCROLL_MARGIN,
        }),
    });
    activeSpellcheckSuggestionId = suggestion.id;
    requestAnimationFrame(() => {
        showSpellcheckTooltip(suggestion);
        updateSpellcheckNavigator();
    });
}

function moveSpellcheckSuggestion(delta) {
    const suggestions = getSpellcheckState().suggestions;
    if (!suggestions.length) return;
    focusSpellcheckSuggestion(getActiveSpellcheckIndex(suggestions) + delta);
}

function applyActiveSpellcheckSuggestion() {
    const suggestions = getSpellcheckState().suggestions;
    const index = getActiveSpellcheckIndex(suggestions);
    const suggestion = index >= 0 ? suggestions[index] : null;
    if (!suggestion) return;
    applySpellcheckSuggestion(suggestion.id);
}

function hideSpellcheckTooltip() {
    clearTimeout(spellcheckTooltipHideTimer);
    cancelAnimationFrame(spellcheckTooltipPositionFrame);
    spellcheckTooltipPositionFrame = 0;
    spellcheckTooltip?.remove();
    spellcheckTooltip = null;
    activeSpellcheckSuggestionId = null;
}

function scheduleHideSpellcheckTooltip(delay = 120) {
    clearTimeout(spellcheckTooltipHideTimer);
    spellcheckTooltipHideTimer = window.setTimeout(hideSpellcheckTooltip, delay);
}

function hideToolbarDisabledTooltip() {
    toolbarDisabledTooltip?.remove();
    toolbarDisabledTooltip = null;
    toolbarDisabledTooltipButton = null;
}

function showToolbarDisabledTooltip(button) {
    const message = button?.dataset?.tooltip;
    if (!button || !message) return;
    if (toolbarDisabledTooltip && toolbarDisabledTooltipButton === button) return;
    hideToolbarDisabledTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'toolbar-disabled-tooltip';
    tooltip.textContent = message;
    document.body.appendChild(tooltip);

    const buttonRect = button.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const left = Math.min(
        Math.max(8, buttonRect.left + (buttonRect.width / 2) - (tooltipRect.width / 2)),
        window.innerWidth - tooltipRect.width - 8
    );
    const top = Math.min(buttonRect.bottom + 8, window.innerHeight - tooltipRect.height - 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    toolbarDisabledTooltip = tooltip;
    toolbarDisabledTooltipButton = button;
}

function positionSpellcheckTooltip(tooltip, suggestion) {
    if (!cmView || !tooltip || !suggestion) return false;
    const coords = cmView.coordsAtPos(suggestion.start);
    if (!coords) return false;

    const scrollerRect = cmView.scrollDOM.getBoundingClientRect();
    if (coords.bottom < scrollerRect.top || coords.top > scrollerRect.bottom) {
        return false;
    }

    const rect = tooltip.getBoundingClientRect();
    const left = Math.min(Math.max(12, coords.left), window.innerWidth - rect.width - 12);
    const top = Math.max(12, coords.top - rect.height - 10);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    return true;
}

function queuePositionSpellcheckTooltip() {
    cancelAnimationFrame(spellcheckTooltipPositionFrame);
    spellcheckTooltipPositionFrame = requestAnimationFrame(() => {
        spellcheckTooltipPositionFrame = 0;
        if (!spellcheckTooltip || !activeSpellcheckSuggestionId) return;
        const suggestion = findSpellcheckSuggestion(activeSpellcheckSuggestionId);
        if (!positionSpellcheckTooltip(spellcheckTooltip, suggestion)) {
            hideSpellcheckTooltip();
        }
    });
}

function handleSpellcheckScroll() {
    if (!spellcheckTooltip) return;
    queuePositionSpellcheckTooltip();
}

function showSpellcheckTooltip(suggestion) {
    if (!cmView || !suggestion) return;
    if (activeSpellcheckSuggestionId === suggestion.id && spellcheckTooltip) {
        positionSpellcheckTooltip(spellcheckTooltip, suggestion);
        return;
    }
    hideSpellcheckTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'spellcheck-tooltip';
    tooltip.dataset.spellcheckId = suggestion.id;
    tooltip.innerHTML = `
        <button class="spellcheck-tooltip-replacement" type="button">${escapeHTML(suggestion.replacement)}</button>
        ${suggestion.reason ? `<span class="spellcheck-tooltip-reason">${escapeHTML(suggestion.reason)}</span>` : ''}
    `;
    document.body.appendChild(tooltip);

    tooltip.querySelector('.spellcheck-tooltip-replacement')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        applySpellcheckSuggestion(suggestion.id);
    });
    tooltip.addEventListener('mouseenter', () => clearTimeout(spellcheckTooltipHideTimer));
    tooltip.addEventListener('mouseleave', () => scheduleHideSpellcheckTooltip());

    spellcheckTooltip = tooltip;
    activeSpellcheckSuggestionId = suggestion.id;
    if (!positionSpellcheckTooltip(tooltip, suggestion)) {
        hideSpellcheckTooltip();
        return;
    }
    updateSpellcheckNavigator();
}

function applySpellcheckSuggestion(id) {
    if (!cmView) return;
    const suggestion = findSpellcheckSuggestion(id);
    if (!suggestion) return;
    if (suggestion.tabId && suggestion.tabId !== state.activeTabId) {
        hideSpellcheckTooltip();
        clearSpellcheckSuggestions();
        showToast("This suggestion belongs to another tab.", "error", 2600);
        return;
    }

    const current = cmView.state.doc.sliceString(suggestion.start, suggestion.end);
    if (current !== suggestion.original) {
        showToast("This suggestion is out of date.", "error", 2600);
        cmView.dispatch({ effects: removeSpellcheckSuggestionEffect.of(id) });
        hideSpellcheckTooltip();
        return;
    }

    const currentIndex = getActiveSpellcheckIndex();
    cmView.dispatch({
        changes: { from: suggestion.start, to: suggestion.end, insert: suggestion.replacement },
        selection: { anchor: suggestion.start + suggestion.replacement.length },
        effects: removeSpellcheckSuggestionEffect.of(id),
        userEvent: 'input.spellcheck',
    });
    hideSpellcheckTooltip();
    requestAnimationFrame(() => {
        const suggestions = getSpellcheckState().suggestions;
        if (suggestions.length) {
            focusSpellcheckSuggestion(Math.min(currentIndex, suggestions.length - 1));
        } else {
            clearSpellcheckSuggestions();
        }
    });
    cmView.focus();
}

function ensureSpellcheckCloseButton() {
    if (spellcheckNavigator) return;
    spellcheckNavigator = document.createElement('div');
    spellcheckNavigator.className = 'spellcheck-navigator';
    spellcheckNavigator.setAttribute('role', 'toolbar');
    spellcheckNavigator.setAttribute('aria-label', 'Spellcheck suggestions');
    spellcheckNavigator.innerHTML = `
        <button class="spellcheck-nav-btn" type="button" title="Previous suggestion" aria-label="Previous suggestion">
            <span class="material-symbols-outlined" aria-hidden="true">keyboard_arrow_up</span>
        </button>
        <span class="spellcheck-nav-count" data-spellcheck-count>0 / 0</span>
        <button class="spellcheck-nav-btn" type="button" title="Next suggestion" aria-label="Next suggestion">
            <span class="material-symbols-outlined" aria-hidden="true">keyboard_arrow_down</span>
        </button>
        <button class="spellcheck-nav-btn spellcheck-nav-apply" type="button" title="Apply suggestion" aria-label="Apply suggestion">
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
        </button>
        <button class="spellcheck-nav-btn spellcheck-nav-close" type="button" title="Close spellcheck" aria-label="Close spellcheck">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
    `;
    const [previousButton, nextButton, applyButton, closeButton] = spellcheckNavigator.querySelectorAll('button');
    previousButton?.addEventListener('click', () => moveSpellcheckSuggestion(-1));
    nextButton?.addEventListener('click', () => moveSpellcheckSuggestion(1));
    applyButton?.addEventListener('click', applyActiveSpellcheckSuggestion);
    closeButton?.addEventListener('click', clearSpellcheckSuggestions);
    spellcheckCloseButton = closeButton || null;
    el.documentArea?.appendChild(spellcheckNavigator);
}

export function clearSpellcheckSuggestions() {
    if (cmView) {
        cmView.dispatch({ effects: setSpellcheckSuggestionsEffect.of([]) });
    }
    hideSpellcheckTooltip();
    spellcheckNavigator?.remove();
    spellcheckNavigator = null;
    spellcheckCloseButton = null;
}

function hideSpellcheckChrome() {
    hideSpellcheckTooltip();
    spellcheckNavigator?.remove();
    spellcheckNavigator = null;
    spellcheckCloseButton = null;
}

export function clearTransientEditorOverlays() {
    hideSpellcheckChrome();
    hidePromptBox({ restoreEditorFocus: false, preserveSupport: true });
}

async function runSpellcheck() {
    const selectedLanguage = await showSpellcheckLanguagePrompt();
    if (!selectedLanguage) return;
    if (!cmView || !state.isEditing) {
        showToast("Open a Markdown document in edit mode first.");
        return;
    }

    const aiConfig = getSpellcheckAIConfig();
    if (aiConfig.error) {
        showToast(aiConfig.error, "error", 3200);
        return;
    }

    const content = getCurrentEditorText();
    if (!content.trim()) {
        showToast("Document content is empty.");
        return;
    }
    const requestTabId = state.activeTabId;

    try {
        clearSpellcheckSuggestions();
        spellcheckInProgress = true;
        hidePromptBox({ restoreEditorFocus: false });
        const chunks = createSpellcheckChunks(content);
        if (chunks.length === 0) {
            showToast("No spelling suggestions found.", "check_circle");
            return;
        }

        let totalSuggestions = 0;
        const taskId = beginProgressTask(`Checking spelling chunk 1 of ${chunks.length}...`, 0);
        for (const [chunkIndex, chunk] of chunks.entries()) {
            if (!isProgressTaskActive(taskId)) {
                return;
            }
            updateProgress(`Checking spelling chunk ${chunkIndex + 1} of ${chunks.length}...`, Math.round((chunkIndex / chunks.length) * 100));
            const result = await SpellCheckDocument({
                content: chunk.content,
                language: {
                    code: selectedLanguage.code === 'auto' ? '' : selectedLanguage.code,
                    name: selectedLanguage.name || '',
                    nativeName: selectedLanguage.nativeName || '',
                    auto: selectedLanguage.auto || selectedLanguage.code === 'auto',
                },
                ai: aiConfig,
            });
            if (!isProgressTaskActive(taskId)) {
                return;
            }

            const incoming = normalizeSpellcheckSuggestions(result?.suggestions || [], chunk.content, chunk.start);
            if (incoming.length === 0) {
                continue;
            }

            const currentContent = getSpellcheckContentForTab(requestTabId, content);
            const existing = getSpellcheckSuggestionsForTab(requestTabId);
            const merged = mergeSpellcheckSuggestions(existing, incoming, currentContent);
            const addedCount = merged.length - existing.length;
            if (addedCount <= 0) {
                continue;
            }

            totalSuggestions += addedCount;
            setSpellcheckSuggestionsForTab(requestTabId, merged);
            if (state.activeTabId === requestTabId) {
                ensureSpellcheckCloseButton();
                updateSpellcheckNavigator();
                if (!activeSpellcheckSuggestionId || existing.length === 0) {
                    focusSpellcheckSuggestion(0);
                }
            }
        }

        updateProgress("Checking spelling...", 100, { active: false });
        if (totalSuggestions === 0) {
            showToast("No spelling suggestions found.", "check_circle");
            finishProgressTask(taskId);
            return;
        }
        if (state.activeTabId === requestTabId) {
            updateSpellcheckNavigator();
        }
        const suggestions = getSpellcheckSuggestionsForTab(requestTabId);
        showToast(`${suggestions.length} spelling suggestion${suggestions.length === 1 ? '' : 's'} found.`, "spellcheck");
        finishProgressTask(taskId);
    } catch (error) {
        if (isCancelledAIError(error)) {
            LogError(`SpellCheckDocument cancelled: ${error?.message || error}`);
            return;
        }
        LogError(`SpellCheckDocument failed: ${error?.message || error}`);
        showToast(error?.message || "Failed to check spelling.", "error", 4200);
    } finally {
        spellcheckInProgress = false;
        hideProgress();
    }
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

function getSlashCommandActions() {
    return {
        bold: () => applyInlineWrap('**', '**'),
        italic: () => applyInlineWrap('*', '*'),
        underline: () => applyInlineWrap('<u>', '</u>'),
        strike: () => applyInlineWrap('~~', '~~'),
        quote: () => applyBlockMarker('quote'),
        h1: () => applyBlockMarker('h1'),
        h2: () => applyBlockMarker('h2'),
        h3: () => applyBlockMarker('h3'),
        ul: () => applyBlockMarker('ul'),
        ol: () => applyBlockMarker('ol'),
        hr: () => insertHorizontalRule(),
        link: () => insertLink(),
        image: () => insertImage(),
        code: () => insertCodeBlock(),
        table: () => insertTable(),
        div: () => insertDivWrapper(),
        task: () => applyBlockMarker('task'),
        find: () => openFindBar(),
        spellcheck: () => runSpellcheck(),
        translateDocument: () => translateCurrentDocument(),
        latex: () => insertLatex(),
        emoji: () => insertEmoji(),
        askAI: () => showAskAIPrompt(),
    };
}

function getSlashCommands() {
    return getConfiguredSlashCommands(getSlashCommandActions(), {
        includeAskAI: !state.aiFeaturesDisabled && window.aiState?.generalToolbarEnabled,
    });
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

function isPlainEditorPrimaryClick(event) {
    return event.button === 0
        && !event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && event.detail === 1;
}

function isEditorContentClick(event, view) {
    return view?.contentDOM && event.target instanceof Node && view.contentDOM.contains(event.target);
}

function rememberPlainEditorClick(event, view) {
    plainClickSelectionState = null;
    if (!isPlainEditorPrimaryClick(event) || !isEditorContentClick(event, view)) {
        return false;
    }

    plainClickSelectionState = {
        x: event.clientX,
        y: event.clientY,
        time: Date.now()
    };
    return false;
}

function collapsePlainEditorClick(event, view) {
    const clickState = plainClickSelectionState;
    plainClickSelectionState = null;

    if (!clickState || !isPlainEditorPrimaryClick(event) || !isEditorContentClick(event, view)) {
        return false;
    }

    const distance = Math.hypot(event.clientX - clickState.x, event.clientY - clickState.y);
    const elapsed = Date.now() - clickState.time;
    if (distance > 4 || elapsed > 700) {
        return false;
    }

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
        return false;
    }

    requestAnimationFrame(() => {
        if (cmView !== view) return;
        const selection = view.state.selection.main;
        if (selection.empty && selection.from === pos) return;
        view.dispatch({ selection: { anchor: pos } });
    });
    return false;
}

function insertStandardOrderedListItem(view) {
    if (state.editorOrderedListStyle !== 'standard') return false;

    const { state: editorState } = view;
    if (editorState.selection.ranges.length !== 1) {
        return false;
    }

    const range = editorState.selection.main;
    if (!range.empty || !markdownLanguage.isActiveAt(editorState, range.from, -1)) {
        return false;
    }

    const line = editorState.doc.lineAt(range.from);
    const beforeCursor = line.text.slice(0, range.from - line.from);
    const afterCursor = line.text.slice(range.from - line.from);
    const match = beforeCursor.match(/^(\s*)\d+([.)])(\s+)(.*)$/);
    if (!match) {
        return false;
    }

    const [, indent, delimiter, spacing, beforeContent] = match;
    const marker = `${indent}1${delimiter}${spacing}`;
    const markerLength = indent.length + 1 + delimiter.length + spacing.length;
    const itemIsEmpty = !beforeContent.trim() && !afterCursor.trim();

    const changes = editorState.changeByRange(range => {
        if (itemIsEmpty) {
            return {
                range: EditorSelection.cursor(line.from + indent.length),
                changes: { from: line.from + indent.length, to: line.from + markerLength, insert: '' }
            };
        }

        const insert = `\n${marker}`;
        return {
            range: EditorSelection.cursor(range.from + insert.length),
            changes: { from: range.from, to: range.from, insert }
        };
    });

    view.dispatch(editorState.update(changes, { scrollIntoView: true, userEvent: "input" }));
    return true;
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
            Prec.highest(keymap.of([{
                key: 'Enter',
                run: insertStandardOrderedListItem
            }])),
            slashMenuKeymap,
            lineNumbers(),
            historyCompartment.of(history()),
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
                    key: 'Mod-Shift-s',
                    run: () => {
                        void saveCurrentDocumentAs();
                        return true;
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
            spellcheckField,
            drawSelection(),
            dropCursor(),
            EditorView.lineWrapping,
            EditorView.domEventHandlers({
                blur() {
                    closeSlashMenu();
                    plainClickSelectionState = null;
                    return false;
                },
                mousedown(event, view) {
                    return rememberPlainEditorClick(event, view);
                },
                mouseup(event, view) {
                    return collapsePlainEditorClick(event, view);
                },
                mouseover(event) {
                    const marker = event.target instanceof Element ? event.target.closest('.cm-spellcheck-marker') : null;
                    const id = marker?.dataset?.spellcheckId;
                    if (!id) return false;
                    clearTimeout(spellcheckTooltipHideTimer);
                    showSpellcheckTooltip(findSpellcheckSuggestion(id));
                    return false;
                },
                mouseout(event) {
                    const marker = event.target instanceof Element ? event.target.closest('.cm-spellcheck-marker') : null;
                    if (!marker) return false;
                    const relatedMarker = event.relatedTarget instanceof Element ? event.relatedTarget.closest('.cm-spellcheck-marker') : null;
                    if (relatedMarker === marker) return false;
                    scheduleHideSpellcheckTooltip();
                    return false;
                },
                click(event) {
                    const marker = event.target instanceof Element ? event.target.closest('.cm-spellcheck-marker') : null;
                    const id = marker?.dataset?.spellcheckId;
                    if (!id) return false;
                    event.preventDefault();
                    showSpellcheckTooltip(findSpellcheckSuggestion(id));
                    return true;
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
                    hideSpellcheckTooltip();
                    const hadUnsavedChanges = state.isEditing && state.currentMarkdownSource !== state.editorOriginalContent;
                    const val = update.state.doc.toString();
                    state.currentMarkdownSource = val;
                    const tab = getActiveTab();
                    if (tab) {
                        tab.currentMarkdownSource = val;
                        tab.editorState = update.state;
                    }
                    const didUpdateTabTitle = updateActiveTabTitleFromContent(val);
                    if (didUpdateTabTitle || hadUnsavedChanges !== (state.isEditing && val !== state.editorOriginalContent)) {
                        renderTabs();
                    }
                    syncEditorStateToBackend();

                    if (isFindBarOpen) {
                        updateFindMatchesDebounced();
                    }
                    if (getSpellcheckState().suggestions.length) {
                        requestAnimationFrame(updateSpellcheckNavigator);
                    }
                }

                if (update.docChanged || update.selectionSet) {
                    if (update.selectionSet) {
                        const selection = update.state.selection.main;
                        state.editorSelection = {
                            anchor: selection.anchor,
                            head: selection.head,
                        };
                        const tab = getActiveTab();
                        if (tab) {
                            tab.editorSelection = state.editorSelection;
                            tab.editorState = update.state;
                        }
                    }
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
    const nextSelection = normalizeEditorSelectionSnapshot(state.editorSelection, nextContent.length);
    const activeTab = getActiveTab();
    if (activeTab?.editorState?.doc?.toString?.() === nextContent) {
        cmView.setState(activeTab.editorState);
        applyEditorFontSize();
        state.editorSelection = normalizeEditorSelectionSnapshot(
            {
                anchor: cmView.state.selection.main.anchor,
                head: cmView.state.selection.main.head,
            },
            nextContent.length
        );
        activeTab.editorSelection = state.editorSelection;
    } else if (activeTab?.editorState) {
        activeTab.editorState = null;
    }

    const currentContent = cmView.state.doc.toString();
    if (currentContent !== nextContent) {
        clearSpellcheckSuggestions();
        resetEditorHistoryAroundSync(() => {
            cmView.dispatch({
                changes: { from: 0, to: cmView.state.doc.length, insert: nextContent },
                selection: EditorSelection.single(nextSelection.anchor, nextSelection.head),
                annotations: Transaction.addToHistory.of(false)
            });
        });
    } else {
        const currentSelection = cmView.state.selection.main;
        if (currentSelection.anchor !== nextSelection.anchor || currentSelection.head !== nextSelection.head) {
            cmView.dispatch({
                selection: EditorSelection.single(nextSelection.anchor, nextSelection.head),
                annotations: Transaction.addToHistory.of(false)
            });
        }
    }

    state.editorSelection = nextSelection;
    if (activeTab) {
        activeTab.editorSelection = nextSelection;
        activeTab.editorState = cmView.state;
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
    if (getSpellcheckState().suggestions.length) {
        updateSpellcheckNavigator();
    } else {
        hideSpellcheckChrome();
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
    clearSpellcheckSuggestions();
    initCodeMirror();

    state.isEditing = true;
    state.editorOriginalContent = state.currentMarkdownSource;
    state.editingSourcePath = state.currentFilePath;
    state.editingSourceFolder = state.currentFolder;
    state.editingPreviewPath = state.currentFilePath;
    state.editingPreviewFolder = state.currentFolder;

    resetEditorHistoryAroundSync(() => {
        cmView.dispatch({
            changes: { from: 0, to: cmView.state.doc.length, insert: state.currentMarkdownSource },
            annotations: Transaction.addToHistory.of(false)
        });
    });
    const tab = getActiveTab();
    if (tab) {
        tab.editorState = cmView.state;
    }
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
    renderTabs();
}

export async function exitEditMode(didSave = false) {
    if (!state.isEditing) return;
    hideLinkTooltip();
    clearSpellcheckSuggestions();
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
    renderTabs();
}

export function hasUnsavedEditorChanges() {
    return state.isEditing && getCurrentEditorText() !== state.editorOriginalContent;
}

export function hasUnsavedTabChanges(tab) {
    if (!tab?.isEditing) return false;
    return (tab.currentMarkdownSource || "") !== (tab.editorOriginalContent || "");
}

export function isEditingDocumentPath(path) {
    if (!path || !state.isEditing) return false;
    const sourcePath = state.editingSourcePath || state.currentFilePath || "";
    return sourcePath === path;
}

export function applyEditedDocumentRename(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return;

    const updatePath = value => value === oldPath ? newPath : value;
    const updateTab = tab => {
        if (!tab) return;
        const pathChanged = tab.path === oldPath;
        tab.path = updatePath(tab.path);
        tab.currentFolder = getPathDirname(tab.path);
        tab.editingSourcePath = updatePath(tab.editingSourcePath);
        tab.editingSourceFolder = tab.editingSourcePath ? getPathDirname(tab.editingSourcePath) : tab.editingSourceFolder;
        tab.editingPreviewPath = updatePath(tab.editingPreviewPath);
        tab.editingPreviewFolder = tab.editingPreviewPath ? getPathDirname(tab.editingPreviewPath) : tab.editingPreviewFolder;
        tab.homeTargetPath = updatePath(tab.homeTargetPath);
        tab.navHistory = (tab.navHistory || []).map(item => ({
            ...item,
            path: updatePath(item.path),
        }));
        if (pathChanged) {
            tab.title = deriveTabTitle(newPath, tab.currentMarkdownSource || state.currentMarkdownSource || "");
        }
    };

    state.tabs.forEach(updateTab);
    state.currentFilePath = updatePath(state.currentFilePath);
    state.currentFolder = getPathDirname(state.currentFilePath);
    state.editingSourcePath = updatePath(state.editingSourcePath);
    state.editingSourceFolder = state.editingSourcePath ? getPathDirname(state.editingSourcePath) : state.editingSourceFolder;
    state.editingPreviewPath = updatePath(state.editingPreviewPath);
    state.editingPreviewFolder = state.editingPreviewPath ? getPathDirname(state.editingPreviewPath) : state.editingPreviewFolder;
    state.homeTargetPath = updatePath(state.homeTargetPath);
    state.navHistory = state.navHistory.map(item => ({
        ...item,
        path: updatePath(item.path),
    }));
    if (el.currentPath) {
        el.currentPath.innerText = state.currentFilePath;
    }
    syncEditorStateToBackend();
    updateNavButtons();
    renderTabs();
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
            savingTab.title = deriveTabTitle(targetPath, contentToSave);
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
            renderTabs();
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

export async function saveCurrentDocumentAs() {
    if (!cmView) return false;

    const contentToSave = cmView.state.doc.toString();
    const currentPath = state.editingSourcePath || state.currentFilePath || "";
    const defaultName = basename(currentPath) || "Untitled.md";
    const selectedPath = await ShowSaveFileDialog(defaultName);
    if (!selectedPath) return false;

    const savingTab = getActiveTab();
    try {
        await SaveFile(selectedPath, contentToSave);

        const selectedFolder = getPathDirname(selectedPath);
        state.currentFilePath = selectedPath;
        state.currentFolder = selectedFolder;
        state.currentDocumentType = 'markdown';
        state.currentMarkdownSource = contentToSave;
        state.editorOriginalContent = contentToSave;
        state.editingSourcePath = selectedPath;
        state.editingSourceFolder = selectedFolder;
        state.editingPreviewPath = selectedPath;
        state.editingPreviewFolder = selectedFolder;
        state.homeTargetPath = selectedPath;
        if (el.currentPath) {
            el.currentPath.innerText = selectedPath;
        }

        if (state.navIndex >= 0 && state.navIndex < state.navHistory.length) {
            state.navHistory[state.navIndex].path = selectedPath;
        } else {
            state.navHistory = [{ path: selectedPath, scroll: 0 }];
            state.navIndex = 0;
        }

        if (savingTab) {
            savingTab.path = selectedPath;
            savingTab.kind = 'document';
            savingTab.documentType = 'markdown';
            savingTab.title = deriveTabTitle(selectedPath, contentToSave);
            savingTab.currentFolder = selectedFolder;
            savingTab.currentMarkdownSource = contentToSave;
            savingTab.editorOriginalContent = contentToSave;
            savingTab.editingSourcePath = selectedPath;
            savingTab.editingSourceFolder = selectedFolder;
            savingTab.editingPreviewPath = selectedPath;
            savingTab.editingPreviewFolder = selectedFolder;
            savingTab.homeTargetPath = selectedPath;
            savingTab.navHistory = state.navHistory.map(item => ({ ...item }));
            savingTab.navIndex = state.navIndex;
        }

        syncEditorStateToBackend();
        renderTabs();
        showToast("File saved successfully.", "check_circle");
        return true;
    } catch (error) {
        LogError(`Save As failed: ${error}`);
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
        renderTabs();
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
            case 'h4':
                lines.push(buildBlockLine(line.text, '#### '));
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

export function showTablePicker() {
    return new Promise((resolve) => {
        let rows = 0;
        let cols = 0;
        const maxRows = 10;
        const maxCols = 10;

        el.modalTitle.textContent = "Insert Table";
        el.modalMessage.textContent = "Select table size (Rows x Columns).";
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.add('hidden');
        el.modalEmojiContainer.classList.add('hidden');
        el.modalTableContainer.classList.remove('hidden');
        el.modalOverlay.classList.remove('hidden');

        const grid = el.modalTableGrid;
        grid.innerHTML = '';
        for (let r = 1; r <= maxRows; r++) {
            for (let c = 1; c <= maxCols; c++) {
                const cell = document.createElement('div');
                cell.className = 'table-grid-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                grid.appendChild(cell);
            }
        }

        const updateHighlight = (r, c) => {
            rows = r;
            cols = c;
            const cells = grid.querySelectorAll('.table-grid-cell');
            cells.forEach(cell => {
                const cr = parseInt(cell.dataset.row);
                const cc = parseInt(cell.dataset.col);
                cell.classList.toggle('highlighted', cr <= rows && cc <= cols);
            });
            el.modalTableInfo.textContent = `${rows} x ${cols} Table`;
        };

        const handleMouseOver = (e) => {
            const cell = e.target.closest('.table-grid-cell');
            if (cell) {
                updateHighlight(parseInt(cell.dataset.row), parseInt(cell.dataset.col));
            }
        };

        const handleClick = (e) => {
            if (rows > 0 && cols > 0) {
                cleanup();
                resolve({ rows, cols });
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') {
                updateHighlight(rows, Math.min(cols + 1, maxCols));
                e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
                updateHighlight(rows, Math.max(cols - 1, 1));
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                updateHighlight(Math.min(rows + 1, maxRows), cols);
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                updateHighlight(Math.max(rows - 1, 1), cols);
                e.preventDefault();
            } else if (e.key === 'Enter' || e.key === ' ') {
                if (rows > 0 && cols > 0) {
                    cleanup();
                    resolve({ rows, cols });
                }
                e.preventDefault();
            } else if (e.key === 'Escape') {
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
            el.modalTableContainer.classList.add('hidden');
            grid.removeEventListener('mouseover', handleMouseOver);
            grid.removeEventListener('click', handleClick);
            el.modalBtnCancel.removeEventListener('click', handleCancelClick);
            document.removeEventListener('keydown', handleKeyDown, true);
        };

        grid.addEventListener('mouseover', handleMouseOver);
        grid.addEventListener('click', handleClick);
        el.modalBtnCancel.addEventListener('click', handleCancelClick);
        document.addEventListener('keydown', handleKeyDown, true);

        updateHighlight(3, 3);
    });
}

async function insertTable() {
    const result = await showTablePicker();
    if (!result) return;
    const { rows, cols } = result;

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

function bindToolbarPopupEvents() {
    if (bindToolbarPopupEvents.bound) return;
    bindToolbarPopupEvents.bound = true;

    el.edHeadingMenu?.addEventListener('click', () => openToolbarPopup(el.edHeadingMenu, 'heading'));
    el.edListMenu?.addEventListener('click', () => openToolbarPopup(el.edListMenu, 'list'));
    el.edInsertMenu?.addEventListener('click', () => openToolbarPopup(el.edInsertMenu, 'insert'));
    el.edMoreMenu?.addEventListener('click', () => openToolbarPopup(el.edMoreMenu, 'more'));
    el.edRenderModeMenu?.addEventListener('click', () => openToolbarPopup(el.edRenderModeMenu, 'renderMode'));
    document.addEventListener('click', event => {
        if (toolbarPopup) {
            if (!toolbarPopup.contains(event.target) && !toolbarPopupTrigger?.contains(event.target)) {
                closeToolbarPopup();
            }
        }
        if (spellcheckTooltip) {
            const target = event.target instanceof Element ? event.target : null;
            const inTooltip = target && spellcheckTooltip.contains(target);
            const inMarker = target?.closest('.cm-spellcheck-marker');
            if (!inTooltip && !inMarker) {
                hideSpellcheckTooltip();
            }
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeToolbarPopup();
            hideSpellcheckTooltip();
        }
    });
    document.addEventListener('mouseover', event => {
        const button = event.target instanceof Element ? event.target.closest('.tool-btn.ai-required-disabled[data-tooltip]') : null;
        if (!button) return;
        showToolbarDisabledTooltip(button);
    });
    document.addEventListener('mouseout', event => {
        const button = event.target instanceof Element ? event.target.closest('.tool-btn.ai-required-disabled[data-tooltip]') : null;
        if (!button) return;
        const related = event.relatedTarget instanceof Element ? event.relatedTarget.closest('.tool-btn.ai-required-disabled[data-tooltip]') : null;
        if (related === button) return;
        hideToolbarDisabledTooltip();
    });
    document.addEventListener('focusin', event => {
        const button = event.target instanceof Element ? event.target.closest('.tool-btn.ai-required-disabled[data-tooltip]') : null;
        if (!button) return;
        showToolbarDisabledTooltip(button);
    });
    document.addEventListener('focusout', event => {
        const button = event.target instanceof Element ? event.target.closest('.tool-btn.ai-required-disabled[data-tooltip]') : null;
        if (!button) return;
        hideToolbarDisabledTooltip();
    });
    window.addEventListener('scroll', hideToolbarDisabledTooltip, true);
    window.addEventListener('scroll', handleSpellcheckScroll, true);
    window.addEventListener('resize', hideToolbarDisabledTooltip);
    window.addEventListener('resize', hideSpellcheckTooltip);
}

export function bindEditorEvents() {
    bindSlashMenuEvents();
    bindTranslationProgressEvents();
    bindToolbarPopupEvents();
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
    if (el.edSpellcheck) {
        el.edSpellcheck.onclick = () => {
            if (el.edSpellcheck.classList.contains('ai-required-disabled')) return;
            void runSpellcheck();
        };
    }
    if (el.edTranslateDoc) {
        el.edTranslateDoc.onclick = () => {
            if (el.edTranslateDoc.classList.contains('ai-required-disabled')) return;
            void translateCurrentDocument();
        };
    }
    el.edRenderMode.onchange = event => {
        void setEditorRenderMode(event.target.value || 'realtime');
    };

    el.edFontMinus.onclick = () => {
        changeEditorFontSize(-1);
    };

    el.edFontPlus.onclick = () => {
        changeEditorFontSize(1);
    };

    el.edCancel.onclick = handleCancel;
    el.edSaveAs.onclick = () => {
        void saveCurrentDocumentAs();
    };
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
