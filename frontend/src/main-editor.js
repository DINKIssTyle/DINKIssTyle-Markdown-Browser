/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { createSpellcheckChunks, normalizeSpellcheckSuggestions, mergeSpellcheckSuggestions } from './spellcheck-text.mjs';
import { cmView, setEditorView } from './editor-view.js';
import { themeCompartment, tokenColorCompartment, getTokenColorExtension, normalizeTokenColors, normalizeBackgroundColor, applyEditorTokenColors, applyEditorBackgroundColor } from './editor-appearance.js';
import { openFindBar, isFindBarOpen, updateFindMatchesDebounced, bindEditorSearchEvents } from './editor-search.js';
import { showTablePicker, showOptionGridPrompt, showEmojiPicker } from './editor-pickers.js';
import { bindEditorPaneSplitter, setEditorPreviewVisible } from './editor-layout.js';
import { syncEditorStateToBackend } from './main-session.js';
import { DEFAULT_CONTENT_FONT_SIZE, DEFAULT_TRANSLATION_LANGUAGE_CODES, EDITOR_FONT_VISUAL_SCALE, getSlashCommands as getConfiguredSlashCommands } from './config.js';
import { state, el, getPathDirname, basename, deriveTabTitle, formatSaveDialogMessage, escapeHTML, escapeAttr, documentTypeFromPath, isEditableDocumentType } from './main-state.js';
import { updateNavButtons, openPath } from './main-navigation.js';
import { createUnsavedMarkdownTab, getActiveTab, renderTabs } from './main-tabs.js';
import { renderActiveTab, renderMarkdown, queueEditorPreviewRender, scrollPreviewToEditorLine, scrollPreviewToEditorLines, hideLinkTooltip, syncDocumentMetadataUI } from './main-render.js';
import { beginProgressTask, finishProgressTask, isProgressTaskActive, showToast, updateProgress, hideProgress, showProgressDelta } from './main-ui.js';
import { persistAppSettings } from './main-settings.js';
import { getConfiguredLanguages } from './main-languages.js';
import { SaveFile, ReadFile, AskConfirm, SelectDocument, SelectImage, GetRelativePath, ShowSaveFileDialog, GetTranslationTargets, TranslateDocumentCopies, SpellCheckDocument, GetDefaultStorageDirectory } from '../bindings/dinkisstyle-markdown-browser/internal/app/app';
import { EventsOn, LogError, LogInfo } from './wails-runtime';
import { isCancellationError, throwIfQueuedTaskCancelled } from './main-cancel.js';
import { isImeKeyboardEvent, normalizeKoreanImeLineBreak, shouldMoveSlashSelectionAfterImeCommit, shouldRunSlashCommandAfterImeCommit } from './ime-enter-fix.mjs';
import { getDeferredStandardOrderedListMarker, getStandardOrderedListEnterEdit } from './ordered-list-enter.mjs';

import { EditorState, EditorSelection, Compartment, Prec, StateEffect, StateField, Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, lineNumbers, drawSelection, dropCursor, Decoration } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { enqueueLLMTask, ghostTextField, hidePromptBox, schedulePromptRefreshForEditorSelection, showAskAIPrompt, showPromptBoxAtSelection, syncAIControls } from './main-ai.js';
import { showTextPrompt } from './main-dialogs.js';
import { buildDocumentFrontMatter, formatLocalISODate, getFirstMarkdownLineTitle, parseDocumentFrontMatter } from './frontmatter.mjs';
import { isMobilePlatform, isMobileUntitledPath, saveDocumentAsForCurrentPlatform } from './platform-common.js';

// ── Module-level State ─────────────────────────────────────
let slashMenuState = null;
let slashMenuEventsBound = false;
let lastPreviewCursorLine = 1;
let previewScrollSyncFrame = 0;
let editorScrollEventsBound = false;
let editorGutterResizeObserver = null;
let translationProgressEventsBound = false;
let lastRenderedPreviewContent = "";
let plainClickSelectionState = null;
let spellcheckTooltip = null;
let spellcheckNavigator = null;
let spellcheckInProgress = false;
let activeSpellcheckSuggestionId = null;
let spellcheckTooltipHideTimer = 0;
let spellcheckTooltipPositionFrame = 0;
let toolbarDisabledTooltip = null;
let toolbarDisabledTooltipButton = null;
export const languageCompartment = new Compartment();
const historyCompartment = new Compartment();

const TRANSLATION_LANGUAGE_STORAGE_KEY = 'dkst.translation.languages';
const SPELLCHECK_LANGUAGE_STORAGE_KEY = 'dkst.spellcheck.language';
const LIVE_TAB_TITLE_CONTENT_LIMIT = 8192;
const IME_DIAGNOSTIC_EVENT_TYPES = Object.freeze([
    'keydown',
    'compositionstart',
    'compositionupdate',
    'compositionend',
    'beforeinput',
    'input',
]);
const IME_DIAGNOSTIC_LOG_LIMIT = 200;
let imeDiagnosticSequence = 0;
let imeDiagnosticStartedAt = 0;

const SPELLCHECK_SCROLL_MARGIN = 220;
const EDITOR_OVERLAY_SCROLL_GAP = 8;
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

function buildFrontMatterDraftDecorations(doc) {
    const source = doc.toString();
    const frontMatter = parseDocumentFrontMatter(source);
    if (!frontMatter.hasFrontMatter) return Decoration.none;

    const decorations = [];
    const closingLine = doc.lineAt(Math.max(0, frontMatter.bodyStart - 1)).number;
    for (let lineNumber = 1; lineNumber <= closingLine; lineNumber += 1) {
        decorations.push(Decoration.line({ class: 'cm-frontmatter-plain' }).range(doc.line(lineNumber).from));
    }

    const yamlSource = source.slice(frontMatter.yamlStart, frontMatter.yamlEnd);
    const match = /^draft[ \t]*:[ \t]*(true|false)(?=[ \t]*(?:#.*)?$)/gmi.exec(yamlSource);
    if (!match) return Decoration.set(decorations, true);

    const valueOffset = match[0].lastIndexOf(match[1]);
    const from = frontMatter.yamlStart + match.index + valueOffset;
    const value = match[1].toLowerCase();
    decorations.push(Decoration.mark({
        class: 'cm-frontmatter-boolean',
        attributes: {
            'data-draft-value': value,
            'aria-label': `Draft ${value}. Click to toggle.`,
            'aria-checked': String(value === 'true'),
            role: 'switch',
            title: `Click to change draft to ${value === 'true' ? 'false' : 'true'}`,
        },
    }).range(from, from + match[1].length));
    return Decoration.set(decorations, true);
}

const frontMatterDraftField = StateField.define({
    create(editorState) {
        return buildFrontMatterDraftDecorations(editorState.doc);
    },
    update(decorations, transaction) {
        return transaction.docChanged ? buildFrontMatterDraftDecorations(transaction.newDoc) : decorations;
    },
    provide: field => EditorView.decorations.from(field),
});

function toggleFrontMatterDraft(view, marker) {
    const position = view.posAtDOM(marker, 0);
    const line = view.state.doc.lineAt(position);
    const match = line.text.match(/^(draft[ \t]*:[ \t]*)(true|false)([ \t]*(?:#.*)?)$/i);
    if (!match) return false;

    const from = line.from + match[1].length;
    const to = from + match[2].length;
    const nextValue = match[2].toLowerCase() === 'true' ? 'false' : 'true';
    view.dispatch({
        changes: { from, to, insert: nextValue },
        userEvent: 'input',
    });
    return true;
}

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
const NON_MARKDOWN_VISIBLE_TOOL_IDS = Object.freeze([
    'ed-find-replace',
    'ed-font-minus',
    'ed-font-plus',
    'ed-cancel',
    'ed-save-as',
    'ed-save',
]);
const TOOLBAR_DIRECT_TOOL_IDS = Object.freeze([
    'ed-find-replace',
    'ed-page-info',
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
    'ed-split-swap',
    'ed-split-direction',
    'ed-preview-toggle',
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
            'ed-page-info',
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
            'ed-split-swap',
            'ed-split-direction',
            'ed-preview-toggle',
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
            'ed-page-info',
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
            'ed-split-swap',
            'ed-split-direction',
            'ed-preview-toggle',
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
    updateEditToolbarScrollbar();
}

export function updateEditToolbarScrollbar() {
    if (!el.editToolbar || !el.editToolbarScrollbar || !el.editToolbarScrollbarThumb) return;
    if (el.editToolbar.classList.contains('hidden') || el.editToolbar.offsetParent === null) {
        el.editToolbarScrollbar.classList.remove('is-visible');
        if (el.editToolbarScrollLeft) el.editToolbarScrollLeft.classList.add('hidden');
        if (el.editToolbarScrollRight) el.editToolbarScrollRight.classList.add('hidden');
        return;
    }

    const clientWidth = el.editToolbar.clientWidth;
    const scrollWidth = el.editToolbar.scrollWidth;
    const maxScroll = scrollWidth - clientWidth;

    if (maxScroll <= 2) {
        el.editToolbarScrollbar.classList.remove('is-visible');
        if (el.editToolbarScrollLeft) el.editToolbarScrollLeft.classList.add('hidden');
        if (el.editToolbarScrollRight) el.editToolbarScrollRight.classList.add('hidden');
        return;
    }

    el.editToolbarScrollbar.classList.add('is-visible');
    const thumbRatio = Math.max(0.08, Math.min(1, clientWidth / scrollWidth));
    const thumbWidthPx = Math.max(18, clientWidth * thumbRatio);
    const scrollLeft = Math.max(0, Math.min(maxScroll, el.editToolbar.scrollLeft));
    const progress = maxScroll > 0 ? scrollLeft / maxScroll : 0;
    const maxTranslate = clientWidth - thumbWidthPx;
    const translateX = progress * maxTranslate;

    el.editToolbarScrollbarThumb.style.width = `${thumbWidthPx}px`;
    el.editToolbarScrollbarThumb.style.transform = `translateX(${translateX}px)`;

    if (el.editToolbarScrollLeft) {
        el.editToolbarScrollLeft.classList.toggle('hidden', scrollLeft <= 2);
    }
    if (el.editToolbarScrollRight) {
        el.editToolbarScrollRight.classList.toggle('hidden', scrollLeft >= maxScroll - 2);
    }
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

export function syncToolbarForDocumentType() {
    applyEditorToolbarMode();
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
    const isNonMarkdown = state.currentDocumentType === 'code' || state.currentDocumentType === 'text';
    const managedIds = new Set([...TOOLBAR_DIRECT_TOOL_IDS, ...TOOLBAR_COLLAPSED_BUTTON_IDS]);

    if (isNonMarkdown) {
        const visibleIds = new Set(NON_MARKDOWN_VISIBLE_TOOL_IDS);
        managedIds.forEach(id => {
            getToolbarElement(id)?.classList.toggle('hidden', !visibleIds.has(id));
        });
        el.edRenderMode?.classList.add('hidden');
        el.edRenderMode?.previousElementSibling?.classList.add('hidden');
        el.edRenderMode?.previousElementSibling?.previousElementSibling?.classList.add('hidden');
        closeToolbarPopup();
        requestAnimationFrame(syncToolbarGroupVisibility);
        return;
    }

    const mode = normalizeEditorToolbarMode(state.editorToolbarMode);
    state.editorToolbarMode = mode;
    const config = TOOLBAR_MODE_CONFIG[mode];
    const shown = new Set(config.show);

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

export function getEditorScrollSnapshot() {
    if (!cmView?.scrollDOM || !state.isEditing) {
        return state.editorScrollTop || 0;
    }
    return cmView.scrollDOM.scrollTop;
}

export function getEditorTopLineSnapshot() {
    if (!cmView || !state.isEditing) {
        return state.editorTopLine || 1;
    }
    return getTopVisibleLineNumber(cmView);
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

export function getTopVisibleLineNumber(view = cmView) {
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
    const configuredCodes = new Set(getConfiguredLanguages().map(language => language.code));
    try {
        const stored = localStorage.getItem(TRANSLATION_LANGUAGE_STORAGE_KEY);
        if (stored !== null) {
            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) {
                return DEFAULT_TRANSLATION_LANGUAGE_CODES.filter(code => configuredCodes.has(code));
            }
            return parsed.filter(code => configuredCodes.has(code));
        }
    } catch {
        // Ignore malformed user storage and fall back to defaults.
    }
    return DEFAULT_TRANSLATION_LANGUAGE_CODES.filter(code => configuredCodes.has(code));
}

function storeTranslationLanguageCodes(codes) {
    localStorage.setItem(TRANSLATION_LANGUAGE_STORAGE_KEY, JSON.stringify(codes));
}

function getOrderedTranslationLanguageCodes(selectedCodes) {
    return getConfiguredLanguages()
        .filter(language => selectedCodes.has(language.code))
        .map(language => language.code);
}

function showTranslationLanguagePrompt() {
    return new Promise((resolve) => {
        const modalContent = el.modalOverlay.querySelector('.modal-content');
        const configuredLanguages = getConfiguredLanguages();
        const selectedCodes = new Set(getStoredTranslationLanguageCodes());
        let languageList = null;

        const renderLanguageList = () => {
            languageList.innerHTML = configuredLanguages.length
                ? configuredLanguages.map(language => `
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
                <div class="language-list"></div>
            `;

            languageList = el.modalLanguageContainer.querySelector('.language-list');

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
            const selected = configuredLanguages.filter(language => selectedCodes.has(language.code));
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
            if (event.isComposing) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel();
                return;
            }

            const checkboxes = getLanguageCheckboxes();
            const active = document.activeElement;
            const checkboxIndex = checkboxes.indexOf(active);

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
        setTimeout(focusFirstLanguageCheckbox, 50);
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
    const provider = aiState.generalProvider || "openai";
    const endpoint = String(aiState.generalEndpoint || "").trim();
    const model = String(aiState.generalModel || "").trim();
    if (provider !== 'apple' && (!endpoint || !model)) {
        return { error: "Set a General AI endpoint and model before translating." };
    }
    return {
        provider,
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

        await enqueueLLMTask({
            label: "Starting translation...",
            run: async ({ isCancelled }) => {
                throwIfQueuedTaskCancelled(isCancelled);
                const taskId = beginProgressTask("Starting translation...", 0);
                const result = await TranslateDocumentCopies({
                    sourcePath: ready.sourcePath,
                    content: ready.content,
                    languages: selectedLanguages,
                    ai: aiConfig,
                    overwriteExisting: existing.length > 0,
                });
                throwIfQueuedTaskCancelled(isCancelled);
                if (!isProgressTaskActive(taskId)) return;
                const sidebar = await import('./main-sidebar.js');
                await sidebar.updateFileTree({ forceRefresh: true });
                await insertTranslatedDocumentLinks(ready.sourcePath, result.targets || []);
                showToast("Translated documents created.", "check_circle");
                finishProgressTask(taskId);
            },
        });
    } catch (error) {
        if (isCancellationError(error)) {
            LogError(`TranslateDocumentCopies cancelled: ${error?.message || error}`);
            return;
        }
        LogError(`TranslateDocumentCopies failed: ${error?.message || error}`);
        showToast(error?.message || "Failed to translate document.", "error", 4200);
    } finally {
        hideProgress();
    }
}

export function showViewerTranslationPrompt() {
    const configuredLanguages = getConfiguredLanguages();
    if (configuredLanguages.length === 0) {
        showToast('Register a language in Settings → Language before translating.', 'translate');
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        
        // Populate select elements
        const savedTarget = localStorage.getItem('dkst.viewer.translation.target') || 'ko-KR';
        const storedTarget = configuredLanguages.some(language => language.code === savedTarget)
            ? savedTarget
            : configuredLanguages[0].code;
        const savedSource = localStorage.getItem('dkst.viewer.translation.source') || 'auto';
        const storedSource = savedSource === 'auto' || configuredLanguages.some(language => language.code === savedSource)
            ? savedSource
            : 'auto';
        const storedCreateFile = localStorage.getItem('dkst.viewer.translation.createFile') !== 'false';

        const sourceSelect = document.getElementById('viewer-translation-source');
        const targetSelect = document.getElementById('viewer-translation-target');
        const createFileCheckbox = document.getElementById('viewer-translation-create-file');

        sourceSelect.innerHTML = `
            <option value="auto" ${storedSource === 'auto' ? 'selected' : ''}>Auto (Detect)</option>
            ${configuredLanguages.map(lang => `
                <option value="${escapeAttr(lang.code)}" ${storedSource === lang.code ? 'selected' : ''}>
                    ${escapeHTML(lang.name)} (${escapeHTML(lang.nativeName)})
                </option>
            `).join('')}
        `;

        targetSelect.innerHTML = configuredLanguages.map(lang => `
            <option value="${escapeAttr(lang.code)}" ${storedTarget === lang.code ? 'selected' : ''}>
                ${escapeHTML(lang.name)} (${escapeHTML(lang.nativeName)})
            </option>
        `).join('');

        if (createFileCheckbox) {
            createFileCheckbox.checked = storedCreateFile;
        }

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            el.modalViewerTranslationContainer.classList.add('hidden');
            el.modalBtnOk.removeEventListener('click', handleOk);
            el.modalBtnCancel.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleKey, true);
        };

        const handleOk = () => {
            const sourceCode = sourceSelect.value;
            const targetCode = targetSelect.value;
            const createFileVal = createFileCheckbox ? createFileCheckbox.checked : true;
            
            localStorage.setItem('dkst.viewer.translation.source', sourceCode);
            localStorage.setItem('dkst.viewer.translation.target', targetCode);
            localStorage.setItem('dkst.viewer.translation.createFile', String(createFileVal));

            cleanup();
            
            const sourceLang = sourceCode === 'auto' ? { code: 'auto', name: 'Auto (Detect)' } : configuredLanguages.find(l => l.code === sourceCode);
            const targetLang = configuredLanguages.find(l => l.code === targetCode);
            
            resolve({ source: sourceLang, target: targetLang, createFile: createFileVal });
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const handleKey = event => {
            if (!el.modalOverlay || el.modalOverlay.classList.contains('hidden')) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel();
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
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.add('hidden');
        el.modalEmojiContainer.classList.add('hidden');
        el.modalTableContainer.classList.add('hidden');
        el.modalLanguageContainer.classList.add('hidden');
        
        el.modalViewerTranslationContainer.classList.remove('hidden');
        el.modalBtnOk.classList.remove('hidden');
        el.modalBtnOk.textContent = "Translate";
        el.modalBtnCancel.textContent = "Cancel";

        el.modalOverlay.classList.remove('hidden');

        el.modalBtnOk.addEventListener('click', handleOk);
        el.modalBtnCancel.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleKey, true);
        
        setTimeout(() => sourceSelect?.focus(), 50);
    });
}

export async function translateViewerDocument() {
    const selected = await showViewerTranslationPrompt();
    if (!selected) {
        return;
    }

    const sourcePath = state.currentFilePath;
    if (!sourcePath || sourcePath === '__home__') {
        showToast("Open a Markdown document first.");
        return;
    }

    const aiConfig = getTranslationAIConfig();
    if (aiConfig.error) {
        showToast(aiConfig.error, "error", 3200);
        return;
    }

    try {
        let existing = [];
        if (selected.createFile) {
            const targets = await GetTranslationTargets(sourcePath, [selected.target]);
            existing = targets.filter(target => target.exists);
            if (existing.length > 0) {
                const message = `These translated files already exist:\n\n${existing.map(target => target.fileName).join('\n')}\n\nOverwrite them?`;
                const overwrite = await AskConfirm("Overwrite Translations", message, "Overwrite", "Cancel");
                if (!overwrite) return;
            }
        }

        await enqueueLLMTask({
            label: "Starting translation...",
            run: async ({ isCancelled }) => {
                throwIfQueuedTaskCancelled(isCancelled);
                const taskId = beginProgressTask("Starting translation...", 0);
                const result = await TranslateDocumentCopies({
                    sourcePath: sourcePath,
                    content: state.currentMarkdownSource || "",
                    languages: [selected.target],
                    ai: aiConfig,
                    overwriteExisting: existing.length > 0,
                    inMemory: !selected.createFile
                });
                throwIfQueuedTaskCancelled(isCancelled);
                if (!isProgressTaskActive(taskId)) return;

                if (selected.createFile) {
                    const sidebar = await import('./main-sidebar.js');
                    await sidebar.updateFileTree({ forceRefresh: true });
                    
                    if (result.targets && result.targets.length > 0) {
                        const targetPath = result.targets[0].path;
                        await openPath(targetPath, { newTab: false, pushHistory: true });
                    }
                    showToast("Translated document created.", "check_circle");
                } else {
                    if (result.translations && result.translations[selected.target.code]) {
                        const translatedText = result.translations[selected.target.code];
                        await renderMarkdown(translatedText);
                        showToast(`Temporarily translated to ${selected.target.name}.`, "check_circle");
                    } else {
                        showToast("Translation failed: Empty response.", "error");
                    }
                }
                finishProgressTask(taskId);
            },
        });
    } catch (error) {
        if (isCancellationError(error)) {
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
    const configuredLanguages = getConfiguredLanguages();
    try {
        const stored = localStorage.getItem(SPELLCHECK_LANGUAGE_STORAGE_KEY);
        if (stored === 'auto' || configuredLanguages.some(language => language.code === stored)) {
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
        const configuredLanguages = getConfiguredLanguages();
        const languageItems = [
            { code: 'auto', name: 'Auto Detect', nativeName: 'Language auto detection', auto: true },
            ...configuredLanguages.map(language => ({ ...language, auto: false })),
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
    el.documentArea?.appendChild(spellcheckNavigator);
}

export function clearSpellcheckSuggestions() {
    if (cmView) {
        cmView.dispatch({ effects: setSpellcheckSuggestionsEffect.of([]) });
    }
    hideSpellcheckTooltip();
    spellcheckNavigator?.remove();
    spellcheckNavigator = null;
}

function hideSpellcheckChrome() {
    hideSpellcheckTooltip();
    spellcheckNavigator?.remove();
    spellcheckNavigator = null;
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
        hidePromptBox({ restoreEditorFocus: false });
        const chunks = createSpellcheckChunks(content);
        if (chunks.length === 0) {
            showToast("No spelling suggestions found.", "check_circle");
            return;
        }

        await enqueueLLMTask({
            label: `Checking spelling chunk 1 of ${chunks.length}...`,
            run: async ({ isCancelled }) => {
                spellcheckInProgress = true;
                let totalSuggestions = 0;
                const taskId = beginProgressTask(`Checking spelling chunk 1 of ${chunks.length}...`, 0);
                for (const [chunkIndex, chunk] of chunks.entries()) {
                    throwIfQueuedTaskCancelled(isCancelled);
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
                    throwIfQueuedTaskCancelled(isCancelled);
                    if (!isProgressTaskActive(taskId)) {
                        return;
                    }

                    const incoming = normalizeSpellcheckSuggestions(result?.suggestions || [], chunk.content, chunk.start, requestTabId);
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
            },
        });
    } catch (error) {
        if (isCancellationError(error)) {
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
        state.editorScrollTop = cmView.scrollDOM.scrollTop;
        state.editorTopLine = getTopVisibleLineNumber(cmView);
        const activeTab = getActiveTab();
        if (activeTab?.id === state.activeTabId && state.isEditing) {
            activeTab.editorScrollTop = state.editorScrollTop;
            activeTab.editorTopLine = state.editorTopLine;
        }
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

function isImeComposing(view = cmView, event = null) {
    if (!view) return false;
    const ime = view.state.field(imeStateField, false);
    return isImeKeyboardEvent({
        eventIsComposing: event?.isComposing,
        keyCode: event?.keyCode,
        codeMirrorComposing: view.composing,
        codeMirrorCompositionStarted: view.compositionStarted,
        observedComposing: ime?.composing,
        justEndedAt: ime?.justEndedAt,
        now: Date.now(),
    });
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

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
        return false;
    }

    if (!view.hasFocus) {
        const scrollTop = view.scrollDOM.scrollTop;
        plainClickSelectionState = { handledFocusReturn: true };

        // WebKit may start a native selection from CodeMirror's old DOM caret
        // when a blurred, manually scrolled editor is clicked. Own this first
        // pointer-down so no old-to-new selection range is ever painted.
        event.preventDefault();
        view.dispatch({
            selection: { anchor: pos },
            userEvent: 'select.pointer',
        });
        view.contentDOM.focus({ preventScroll: true });
        view.scrollDOM.scrollTop = scrollTop;

        requestAnimationFrame(() => {
            if (cmView !== view) return;
            const selection = view.state.selection.main;
            if (!selection.empty || selection.from !== pos) {
                view.dispatch({
                    selection: { anchor: pos },
                    userEvent: 'select.pointer',
                });
            }
            view.scrollDOM.scrollTop = scrollTop;
        });
        return true;
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

    if (clickState?.handledFocusReturn) {
        return false;
    }

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

function getStandardOrderedListItemEdit(view, inputCursor) {
    if (state.editorOrderedListStyle !== 'standard') return false;

    const { state: editorState } = view;
    const hasInputCursor = Number.isInteger(inputCursor);
    if (!hasInputCursor && editorState.selection.ranges.length !== 1) {
        return false;
    }

    const range = hasInputCursor
        ? EditorSelection.cursor(inputCursor)
        : editorState.selection.main;
    if (!range.empty || !markdownLanguage.isActiveAt(editorState, range.from, -1)) {
        return false;
    }

    const line = editorState.doc.lineAt(range.from);
    const edit = getStandardOrderedListEnterEdit(line.text, range.from - line.from);
    if (!edit) return false;

    return {
        changes: {
            from: line.from + edit.fromOffset,
            to: line.from + edit.toOffset,
            insert: edit.insert,
        },
        cursor: line.from + edit.cursorOffset,
        previousLineText: line.text,
        relativeEdit: edit,
    };
}

function insertStandardOrderedListItem(view, inputCursor) {
    const edit = getStandardOrderedListItemEdit(view, inputCursor);
    if (!edit) return false;

    view.dispatch(view.state.update({
        changes: edit.changes,
        selection: EditorSelection.cursor(edit.cursor),
        scrollIntoView: true,
        userEvent: "input",
    }));
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

function recordImeDiagnostic(kind, details = {}) {
    let enabled = import.meta.env.DEV || globalThis.__DKST_IME_DEBUG__ === true;
    if (!enabled) {
        try {
            enabled = localStorage.getItem('dkst.debug.ime') === '1';
        } catch {
            // localStorage can be unavailable in restricted browser contexts.
        }
    }
    if (!enabled) return;

    const now = performance.now();
    if (!imeDiagnosticStartedAt) imeDiagnosticStartedAt = now;

    const entry = {
        sequence: ++imeDiagnosticSequence,
        elapsedMs: Number((now - imeDiagnosticStartedAt).toFixed(3)),
        kind,
        ...details,
    };

    const log = globalThis.__DKST_IME_LOG__ || (globalThis.__DKST_IME_LOG__ = []);
    log.push(entry);
    if (log.length > IME_DIAGNOSTIC_LOG_LIMIT) {
        log.splice(0, log.length - IME_DIAGNOSTIC_LOG_LIMIT);
    }

    const message = `[IME Timeline] ${JSON.stringify(entry)}`;
    console.debug(message);
    try {
        LogInfo(message);
    } catch {
        // The Wails runtime is unavailable in browser-only development.
    }
}

function describeImeDomEvent(event, view) {
    const details = {
        type: event.type,
        isComposing: !!event.isComposing,
        codeMirrorComposing: view.composing,
        codeMirrorCompositionStarted: view.compositionStarted,
        defaultPrevented: event.defaultPrevented,
    };

    if ('key' in event) {
        details.key = event.key;
        details.code = event.code;
        details.keyCode = event.keyCode;
        details.repeat = event.repeat;
    }
    if ('inputType' in event) {
        details.inputType = event.inputType;
        details.data = event.data;
    }
    if ('data' in event && !('inputType' in event)) {
        details.data = event.data;
    }

    return details;
}

const imeDiagnostics = ViewPlugin.fromClass(class {
    constructor(view) {
        this.view = view;
        this.handleEvent = (event) => {
            recordImeDiagnostic('dom', describeImeDomEvent(event, this.view));
        };
        for (const type of IME_DIAGNOSTIC_EVENT_TYPES) {
            view.contentDOM.addEventListener(type, this.handleEvent, true);
        }
    }

    update(update) {
        for (const tr of update.transactions) {
            const changes = [];
            tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                changes.push({
                    from: fromA,
                    to: toA,
                    newFrom: fromB,
                    newTo: toB,
                    insert: inserted.toString(),
                });
            });
            recordImeDiagnostic('transaction', {
                docChanged: tr.docChanged,
                userEvent: tr.annotation(Transaction.userEvent) || null,
                changes,
                selectionBefore: {
                    anchor: tr.startState.selection.main.anchor,
                    head: tr.startState.selection.main.head,
                },
                selectionAfter: {
                    anchor: tr.state.selection.main.anchor,
                    head: tr.state.selection.main.head,
                },
            });
        }
    }

    destroy() {
        for (const type of IME_DIAGNOSTIC_EVENT_TYPES) {
            this.view.contentDOM.removeEventListener(type, this.handleEvent, true);
        }
    }
});

// CodeMirror intentionally drops keydown events while an IME composition is
// active. Observe them in the capture phase so slash-menu keys can first
// commit the marked text and then run their editor action.
const imeSlashMenuKeyHandler = ViewPlugin.fromClass(class {
    constructor(view) {
        this.view = view;
        this.handleKeydown = (event) => {
            if (!state.koreanImeFixEnabled || !slashMenuState) return;

            const composing = isImeComposing(this.view, event);
            const selectedCommand = slashMenuState.commands[slashMenuState.selectedIndex];
            const runCommand = shouldRunSlashCommandAfterImeCommit({
                enabled: state.koreanImeFixEnabled,
                key: event.key,
                composing,
                hasMenu: true,
                hasCommand: !!selectedCommand,
            });
            const moveSelection = shouldMoveSlashSelectionAfterImeCommit({
                enabled: state.koreanImeFixEnabled,
                key: event.key,
                composing,
                hasMenu: true,
                hasCommand: !!selectedCommand,
            });
            if (!runCommand && !moveSelection) return;

            const commandId = selectedCommand.id;
            const commandFrom = slashMenuState.from;
            event.preventDefault();
            event.stopImmediatePropagation();
            recordImeDiagnostic('fix', {
                action: runCommand ? 'commit-and-run-slash-command' : 'commit-and-move-slash-selection',
                key: event.key,
                commandId,
                commandFrom,
                eventIsComposing: !!event.isComposing,
                keyCode: event.keyCode,
            });
            runSlashMenuActionAfterImeCommit(this.view, {
                key: event.key,
                commandId,
                commandFrom,
            });
        };
        view.contentDOM.addEventListener('keydown', this.handleKeydown, true);
    }

    destroy() {
        this.view.contentDOM.removeEventListener('keydown', this.handleKeydown, true);
    }
});

// WebKit may represent one Enter immediately after a CJK composition as "\n\n".
// Normalize only that exact DOM input. CodeMirror already handles the Safari
// keydown/compositionend ordering quirk, so consuming Enter here would swallow
// the user's intended line break.
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

const pendingImeListContinuations = new WeakMap();

function applyPendingImeListContinuation(view) {
    const pending = pendingImeListContinuations.get(view);
    if (!pending || cmView !== view) return;

    const ime = view.state.field(imeStateField, false);
    if (view.compositionStarted || ime?.composing) {
        pending.waitedForComposition = true;
        return;
    }

    pendingImeListContinuations.delete(view);
    const { position, marker, previousLineText } = pending;
    const { doc, selection } = view.state;
    if (position <= 0 || position > doc.length) return;

    const targetLine = doc.lineAt(position);
    const selectionLine = doc.lineAt(selection.main.head);
    const previousLine = doc.lineAt(position - 1);
    if (targetLine.from !== position || selectionLine.from !== position || previousLine.text !== previousLineText) {
        return;
    }

    const changes = view.state.changes({ from: position, insert: marker });
    const mappedSelection = selection.main.empty && selection.main.from === position
        ? EditorSelection.cursor(position + marker.length)
        : selection.map(changes);

    recordImeDiagnostic('fix', {
        action: 'apply-list-continuation',
        position,
        marker,
        waitedForComposition: pending.waitedForComposition,
    });
    view.dispatch({
        changes,
        selection: mappedSelection,
        scrollIntoView: true,
        userEvent: 'input',
    });
}

function scheduleImeListContinuation(view, continuation) {
    pendingImeListContinuations.set(view, {
        ...continuation,
        waitedForComposition: false,
    });
    requestAnimationFrame(() => applyPendingImeListContinuation(view));
}

const koreanImeEnterFix = [
    imeStateField,
    // 조합 상태는 "관찰"만 합니다.
    EditorView.domEventObservers({
        compositionstart(event, view) {
            view.dispatch({
                effects: setImeState.of({ composing: true, justEndedAt: 0 })
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
            requestAnimationFrame(() => applyPendingImeListContinuation(view));
        },
        blur(event, view) {
            pendingImeListContinuations.delete(view);
        }
    }),
    EditorView.inputHandler.of((view, from, to, text) => {
        const ime = view.state.field(imeStateField, false);
        if (!ime) return false;

        const normalizedText = normalizeKoreanImeLineBreak({
            enabled: state.koreanImeFixEnabled,
            text,
            composing: ime.composing,
            justEndedAt: ime.justEndedAt,
            now: Date.now(),
        });
        if (normalizedText === null) return false;

        recordImeDiagnostic('fix', {
            action: 'normalize-line-break',
            from,
            to,
            originalText: text,
            normalizedText,
        });

        const listEdit = from === to ? getStandardOrderedListItemEdit(view, from) : null;
        const deferredMarker = listEdit && listEdit.changes.from === from && listEdit.changes.to === from
            ? getDeferredStandardOrderedListMarker(listEdit.relativeEdit, normalizedText)
            : '';

        view.dispatch({
            changes: { from, to, insert: normalizedText },
            selection: EditorSelection.cursor(from + normalizedText.length),
            scrollIntoView: true,
            userEvent: 'input.type',
        });
        if (deferredMarker) {
            scheduleImeListContinuation(view, {
                position: from + normalizedText.length,
                marker: deferredMarker,
                previousLineText: listEdit.previousLineText,
            });
        }
        return true;
    })
];

// ── Editor Mode ────────────────────────────────────────────

function getEditorAIDockScrollMargin(view) {
    const dock = el.editorAiDock;
    if (!dock
        || dock.classList.contains('hidden')
        || !dock.classList.contains('is-visible')) {
        return null;
    }

    const editorRect = view.scrollDOM.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const overlapsHorizontally = dockRect.left < editorRect.right && dockRect.right > editorRect.left;
    const reachesEditorBottom = dockRect.bottom >= editorRect.bottom - 1;
    if (!overlapsHorizontally || !reachesEditorBottom || dockRect.top >= editorRect.bottom) {
        return null;
    }

    const coveredHeight = editorRect.bottom - Math.max(editorRect.top, dockRect.top);
    if (coveredHeight <= 0) return null;

    return {
        bottom: Math.ceil(Math.min(editorRect.height, coveredHeight + EDITOR_OVERLAY_SCROLL_GAP)),
    };
}

export function initCodeMirror() {
    if (cmView) return;

    // Create new CodeMirror view
    const startState = EditorState.create({
        doc: state.currentMarkdownSource || "",
        extensions: [
            imeSlashMenuKeyHandler,
            imeDiagnostics,
            Prec.highest(koreanImeEnterFix),
            Prec.highest(keymap.of([{
                key: 'Enter',
                run: insertStandardOrderedListItem
            }])),
            slashMenuKeymap,
            lineNumbers(),
            EditorView.scrollMargins.of(getEditorAIDockScrollMargin),
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
            languageCompartment.of(markdown({ base: markdownLanguage, codeLanguages: languages })),
            themeCompartment.of(document.documentElement.classList.contains('dark') ? oneDark : []),
            tokenColorCompartment.of(getTokenColorExtension()),
            ghostTextField,
            spellcheckField,
            frontMatterDraftField,
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
                click(event, view) {
                    const draftMarker = event.target instanceof Element ? event.target.closest('.cm-frontmatter-boolean') : null;
                    if (draftMarker) {
                        event.preventDefault();
                        return toggleFrontMatterDraft(view, draftMarker);
                    }
                    const marker = event.target instanceof Element ? event.target.closest('.cm-spellcheck-marker') : null;
                    const id = marker?.dataset?.spellcheckId;
                    if (!id) return false;
                    event.preventDefault();
                    showSpellcheckTooltip(findSpellcheckSuggestion(id));
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
                    syncDocumentMetadataUI(val);
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
                            tab.editorSelections = tab.editorSelections || {};
                            const selectionKey = state.editingSourcePath || state.currentFilePath;
                            if (selectionKey) {
                                tab.editorSelections[selectionKey] = state.editorSelection;
                            }
                            tab.editorState = update.state;
                        }
                        schedulePromptRefreshForEditorSelection();
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

    setEditorView(new EditorView({
        state: startState,
        parent: el.editorView
    }));
    bindEditorGutterWidthSync();
    bindEditorScrollSync();
    bindEditorSearchEvents();

    // hide old textarea
    if (el.markdownEditor) el.markdownEditor.style.display = 'none';

    // Apply font size
    applyEditorFontSize();
    cmView.contentDOM.style.fontFamily = 'var(--code-font)';
}

function bindEditorGutterWidthSync() {
    editorGutterResizeObserver?.disconnect();
    editorGutterResizeObserver = null;

    const gutters = cmView?.dom.querySelector('.cm-gutters');
    if (!gutters) return;

    const syncGutterWidth = () => {
        const gutterWidth = gutters.getBoundingClientRect().width;
        if (gutterWidth > 0) {
            cmView?.dom.style.setProperty('--editor-gutter-width', `${gutterWidth}px`);
        }
    };

    requestAnimationFrame(syncGutterWidth);
    if (typeof ResizeObserver === 'function') {
        editorGutterResizeObserver = new ResizeObserver(syncGutterWidth);
        editorGutterResizeObserver.observe(gutters);
    }
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
        cmView.dispatch({
            selection: EditorSelection.single(nextSelection.anchor, nextSelection.head),
            annotations: Transaction.addToHistory.of(false)
        });
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

    updateEditorLanguageForPath(state.editingSourcePath || state.currentFilePath);
    const isNonMarkdown = state.currentDocumentType === 'code' || state.currentDocumentType === 'text';
    if (isNonMarkdown) {
        setEditorPreviewVisible(false);
    }
    syncToolbarForDocumentType();

    const restoreTopLine = Math.max(1, Math.round(Number(state.editorTopLine) || 1));
    const restoreScrollTop = Math.max(0, Number(state.editorScrollTop) || 0);
    requestAnimationFrame(() => {
        if (!state.isEditing || !cmView?.scrollDOM) {
            return;
        }
        restoreEditorViewPosition(restoreTopLine, restoreScrollTop);
    });

    lastRenderedPreviewContent = nextContent;
    lastPreviewCursorLine = getCursorLineNumber(cmView.state);
    if (el.edRenderMode) {
        el.edRenderMode.value = state.currentEditorRenderMode;
    }
    if (getSpellcheckState().suggestions.length) {
        updateSpellcheckNavigator();
    } else {
        hideSpellcheckChrome();
    }
    updateSlashMenu();
}

function restoreEditorViewPosition(topLine, fallbackScrollTop = 0) {
    if (!cmView?.scrollDOM) return;
    const targetLine = Math.max(1, Math.min(topLine, cmView.state.doc.lines));
    try {
        const line = cmView.state.doc.line(targetLine);
        cmView.dispatch({
            effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 0 })
        });
        requestAnimationFrame(() => {
            if (!state.isEditing || !cmView?.scrollDOM) return;
            const visibleLine = getTopVisibleLineNumber(cmView);
            if (Math.abs(visibleLine - targetLine) > 1 && fallbackScrollTop > 0) {
                cmView.scrollDOM.scrollTop = fallbackScrollTop;
            }
            state.editorTopLine = getTopVisibleLineNumber(cmView);
            state.editorScrollTop = cmView.scrollDOM.scrollTop;
            const activeTab = getActiveTab();
            if (activeTab?.id === state.activeTabId) {
                activeTab.editorTopLine = state.editorTopLine;
                activeTab.editorScrollTop = state.editorScrollTop;
            }
        });
    } catch (error) {
        if (fallbackScrollTop > 0) {
            cmView.scrollDOM.scrollTop = fallbackScrollTop;
        }
    }
}

export async function createNewDocument() {
    if (isMobilePlatform()) {
        try {
            const defaultDir = await GetDefaultStorageDirectory();
            if (defaultDir) {
                let candidateName = "Untitled.md";
                let candidatePath = `${defaultDir}/${candidateName}`;
                for (let i = 1; i < 1000; i++) {
                    try {
                        await ReadFile(candidatePath);
                        candidateName = `Untitled ${i}.md`;
                        candidatePath = `${defaultDir}/${candidateName}`;
                    } catch {
                        break;
                    }
                }

                const inputName = await showTextPrompt("New Document", "Enter a name for the new file:", candidateName, { select: true });
                if (inputName === null) {
                    return;
                }
                let fileName = inputName.trim();
                if (!fileName) {
                    fileName = candidateName;
                }
                if (!/\.(md|markdown)$/i.test(fileName)) {
                    fileName += '.md';
                }

                const targetPath = `${defaultDir}/${fileName}`;
                try {
                    await ReadFile(targetPath);
                    const overwrite = await AskConfirm(
                        "File Already Exists",
                        `"${fileName}" already exists. Do you want to replace it?`,
                        "Replace",
                        "Cancel"
                    );
                    if (!overwrite) return;
                } catch {
                    // File doesn't exist, proceed
                }

                await SaveFile(targetPath, "");
                const { updateFileTree } = await import('./main-sidebar.js');
                await updateFileTree({ forceRefresh: true });
                await openPath(targetPath, { pushHistory: true, setHome: true, newTab: true, openInEditMode: true });
                showToast("New document created.");
                return;
            }
        } catch (err) {
            console.warn("Mobile createNewDocument storage dir fallback:", err);
        }
        await createUnsavedMarkdownTab();
        const { updateFileTree } = await import('./main-sidebar.js');
        await updateFileTree({ forceRefresh: true });
        showToast("New document created.");
        return;
    }

    const defaultName = "Untitled.md";
    try {
        const selectedPath = await ShowSaveFileDialog(defaultName);
        if (selectedPath) {
            await SaveFile(selectedPath, "");
            const { updateFileTree } = await import('./main-sidebar.js');
            await updateFileTree({ forceRefresh: true });
            await openPath(selectedPath, { pushHistory: true, setHome: true, newTab: true, openInEditMode: true });
            showToast("New document created.");
        }
    } catch (e) {
        console.error("Failed to create new document:", e);
    }
}

export async function updateEditorLanguageForPath(filePath) {
    if (!cmView) return;
    const type = documentTypeFromPath(filePath);
    if (type === 'markdown') {
        cmView.dispatch({
            effects: languageCompartment.reconfigure(markdown({ base: markdownLanguage, codeLanguages: languages }))
        });
        return;
    }
    if (type === 'code') {
        const fileName = basename(filePath);
        const desc = LanguageDescription.matchFilename(languages, fileName);
        if (desc) {
            try {
                const support = await desc.load();
                if (cmView) {
                    cmView.dispatch({
                        effects: languageCompartment.reconfigure(support)
                    });
                }
                return;
            } catch (e) {
                console.warn('Failed to load language support for', filePath, e);
            }
        }
    }
    cmView.dispatch({
        effects: languageCompartment.reconfigure([])
    });
}

export function enterEditMode() {
    if (state.isEditing) {
        handleCancel();
        return;
    }
    if (!isEditableDocumentType(state.currentDocumentType)) return;

    hideLinkTooltip();
    clearSpellcheckSuggestions();
    initCodeMirror();

    state.isEditing = true;
    state.editorOriginalContent = state.currentMarkdownSource;
    state.editingSourcePath = state.currentFilePath;
    state.editingSourceFolder = state.currentFolder;
    state.editingPreviewPath = state.currentFilePath;
    state.editingPreviewFolder = state.currentFolder;

    updateEditorLanguageForPath(state.currentFilePath);
    const isNonMarkdown = state.currentDocumentType === 'code' || state.currentDocumentType === 'text';
    if (isNonMarkdown) {
        setEditorPreviewVisible(false);
    }
    syncToolbarForDocumentType();

    const nextSelection = normalizeEditorSelectionSnapshot(state.editorSelection, state.currentMarkdownSource.length);
    resetEditorHistoryAroundSync(() => {
        cmView.dispatch({
            changes: { from: 0, to: cmView.state.doc.length, insert: state.currentMarkdownSource },
            selection: EditorSelection.single(nextSelection.anchor, nextSelection.head),
            annotations: Transaction.addToHistory.of(false)
        });
    });
    const tab = getActiveTab();
    if (tab) {
        tab.editorState = cmView.state;
    }
    lastPreviewCursorLine = getCursorLineNumber(cmView.state);
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
    if (el.btnTranslate) {
        el.btnTranslate.disabled = true;
    }

    // Also dispatch an empty ghost text just in case
    if (window.aiState) window.aiState.ghostText = "";
    syncAIControls();
    updateSlashMenu();
    cmView.focus();
    schedulePreviewScrollSync(cmView);
    updateNavButtons(); // 에디터 진입 시 버튼 아이콘/상태 전환을 위해 호출
    syncEditorStateToBackend();
    renderTabs();
    requestAnimationFrame(() => updateEditToolbarScrollbar());
}

export async function exitEditMode(didSave = false) {
    if (!state.isEditing) return;
    hideLinkTooltip();
    clearSpellcheckSuggestions();
    hidePromptBox({ restoreEditorFocus: false, immediate: true });
    closeSlashMenu();
    clearTimeout(window._renderTimer);

    state.isEditing = false;
    state.editingSourcePath = "";
    state.editingSourceFolder = "";
    state.editingPreviewPath = "";
    state.editingPreviewFolder = "";
    el.editToolbar.classList.add('hidden');
    if (el.editToolbarScrollLeft) el.editToolbarScrollLeft.classList.add('hidden');
    if (el.editToolbarScrollRight) el.editToolbarScrollRight.classList.add('hidden');
    el.editorView.classList.add('hidden');
    el.mainContainer.classList.remove('is-editing');
    el.btnEdit.classList.remove('active');
    el.selectEngine.disabled = false;
    syncAIControls();

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

    if (isMobilePlatform() && isMobileUntitledPath(targetPath)) {
        const saved = state.activeTabId === savingTabId
            ? await saveCurrentDocumentAs()
            : await saveTabDocument(savingTab, { confirm: false });
        if (saved && exitAfterSave && state.activeTabId === savingTabId && !hasUnsavedEditorChanges()) await exitEditMode(true);
        return saved;
    }

    try {
        await SaveFile(targetPath, contentToSave);
        showToast("File saved successfully.", "check_circle");
        if (savingTab) {
            savingTab.title = deriveTabTitle(targetPath, contentToSave);
            savingTab.currentMarkdownSource = state.activeTabId === savingTabId
                ? getCurrentEditorText() : savingTab.currentMarkdownSource;
            savingTab.editorOriginalContent = contentToSave;
            savingTab.editingPreviewPath = savingTab.editingSourcePath || targetPath;
            savingTab.editingPreviewFolder = savingTab.editingSourceFolder || getPathDirname(targetPath);
        }
        if (state.activeTabId === savingTabId) {
            state.editorOriginalContent = contentToSave;
            state.currentMarkdownSource = getCurrentEditorText();
            state.editingPreviewPath = state.editingSourcePath || targetPath;
            state.editingPreviewFolder = state.editingSourceFolder || getPathDirname(targetPath);
            if (exitAfterSave && !hasUnsavedEditorChanges()) {
                await exitEditMode(true);
            }
        }
        syncEditorStateToBackend();
        renderTabs();
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
    const savingTabId = state.activeTabId;
    const savingTab = getActiveTab();
    if (isMobilePlatform()) {
        try {
            const saved = await saveDocumentAsForCurrentPlatform(defaultName, contentToSave);
            if (saved) {
                if (state.activeTabId === savingTabId) {
                    state.currentMarkdownSource = getCurrentEditorText();
                    state.editorOriginalContent = contentToSave;
                }
                if (savingTab) {
                    savingTab.currentMarkdownSource = state.activeTabId === savingTabId
                        ? getCurrentEditorText() : savingTab.currentMarkdownSource;
                    savingTab.editorOriginalContent = contentToSave;
                }
                syncEditorStateToBackend();
                renderTabs();
                showToast('Document exported successfully.', 'check_circle');
            }
            return saved;
        } catch (error) {
            LogError(`Mobile Save As failed: ${error?.message || error}`);
            showToast('Failed to export document.', 'error');
            return false;
        }
    }
    const selectedPath = await ShowSaveFileDialog(defaultName);
    if (!selectedPath) return false;

    try {
        await SaveFile(selectedPath, contentToSave);

        const selectedFolder = getPathDirname(selectedPath);
        if (savingTab) {
            savingTab.path = selectedPath;
            savingTab.kind = 'document';
            savingTab.documentType = 'markdown';
            savingTab.title = deriveTabTitle(selectedPath, contentToSave);
            savingTab.currentFolder = selectedFolder;
            savingTab.currentMarkdownSource = state.activeTabId === savingTabId
                ? getCurrentEditorText() : savingTab.currentMarkdownSource;
            savingTab.editorOriginalContent = contentToSave;
            savingTab.editingSourcePath = selectedPath;
            savingTab.editingSourceFolder = selectedFolder;
            savingTab.editingPreviewPath = selectedPath;
            savingTab.editingPreviewFolder = selectedFolder;
            savingTab.homeTargetPath = selectedPath;
            savingTab.navHistory = (savingTab.navHistory || []).map(item => ({ ...item }));
            if (savingTab.navIndex >= 0 && savingTab.navIndex < savingTab.navHistory.length) {
                savingTab.navHistory[savingTab.navIndex].path = selectedPath;
            } else {
                savingTab.navHistory = [{ path: selectedPath, scroll: 0 }];
                savingTab.navIndex = 0;
            }
        }

        if (state.activeTabId === savingTabId) {
            state.currentFilePath = selectedPath;
            state.currentFolder = selectedFolder;
            state.currentDocumentType = 'markdown';
            state.currentMarkdownSource = getCurrentEditorText();
            state.editorOriginalContent = contentToSave;
            state.editingSourcePath = selectedPath;
            state.editingSourceFolder = selectedFolder;
            state.editingPreviewPath = selectedPath;
            state.editingPreviewFolder = selectedFolder;
            state.homeTargetPath = selectedPath;
            if (el.currentPath) {
                el.currentPath.innerText = selectedPath;
            }
            if (savingTab) {
                state.navHistory = savingTab.navHistory.map(item => ({ ...item }));
                state.navIndex = savingTab.navIndex;
            }
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


    if (isMobilePlatform() && isMobileUntitledPath(targetPath)) {
        try {
            const saved = await saveDocumentAsForCurrentPlatform(basename(targetPath) || 'Untitled.md', contentToSave);
            if (saved) {
                tab.editorOriginalContent = contentToSave;
                if (state.activeTabId === tab.id) state.editorOriginalContent = contentToSave;
                // Keep any edits made while this background save was in flight.
                showToast('Document exported successfully.', 'check_circle');
                syncEditorStateToBackend();
                renderTabs();
            }
            return saved;
        } catch (error) {
            LogError(`Mobile tab export failed: ${error?.message || error}`);
            showToast('Failed to export document.', 'error');
            return false;
        }
    }

    try {
        await SaveFile(targetPath, contentToSave);
        tab.editorOriginalContent = contentToSave;
        if (state.activeTabId === tab.id) state.editorOriginalContent = contentToSave;
        // Keep any edits made while this background save was in flight.
        tab.editingPreviewPath = tab.editingSourcePath || targetPath;
        tab.editingPreviewFolder = tab.editingSourceFolder || getPathDirname(targetPath);
        showToast("File saved successfully.", "check_circle");
        syncEditorStateToBackend();
        renderTabs();
        return true;
    } catch (error) {
        LogError(`Save failed: ${error}`);
        showToast("Failed to save file.", "error");
        return false;
    }
}

async function handleSave() {
    await saveCurrentDocument({
        confirm: true,
        exitAfterSave: !isMobilePlatform(),
    });
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

function runSlashMenuActionAfterImeCommit(view, { key, commandId, commandFrom }) {
    view.contentDOM.blur();
    requestAnimationFrame(() => {
        if (cmView !== view) return;

        view.focus();
        updateSlashMenu();
        if (!slashMenuState || slashMenuState.from !== commandFrom) return;
        const selectedIndex = slashMenuState.commands.findIndex(command => command.id === commandId);
        if (selectedIndex < 0) return;

        if (key === 'Enter') {
            void executeSlashCommand(commandId);
            return;
        }

        slashMenuState.selectedIndex = selectedIndex;
        moveSlashSelection(key === 'ArrowDown' ? 1 : -1);
    });
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

    const url = await showTextPrompt("Insert Link", "Enter link URL:", "https://");
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

    const url = await showTextPrompt("Insert Image", "Enter image URL:", "https://");
    if (url) insertTextAtCursor('![', `](${formatMarkdownDestination(url)})`);
}

function insertCodeBlock() {
    insertTextAtCursor('\n\`\`\`\n', '\n\`\`\`\n');
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
    const width = await showTextPrompt("DIV Wrapper", "Width (e.g. 100%, 400px):", "100%");
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
        const button = event.target instanceof Element ? event.target.closest('.tool-btn.ai-required-disabled[data-tooltip], .nav-btn.ai-required-disabled[data-tooltip]') : null;
        if (!button) return;
        showToolbarDisabledTooltip(button);
    });
    document.addEventListener('mouseout', event => {
        const button = event.target instanceof Element ? event.target.closest('.tool-btn.ai-required-disabled[data-tooltip], .nav-btn.ai-required-disabled[data-tooltip]') : null;
        if (!button) return;
        const related = event.relatedTarget instanceof Element ? event.relatedTarget.closest('.tool-btn.ai-required-disabled[data-tooltip], .nav-btn.ai-required-disabled[data-tooltip]') : null;
        if (related === button) return;
        hideToolbarDisabledTooltip();
    });
    document.addEventListener('focusin', event => {
        const button = event.target instanceof Element ? event.target.closest('.tool-btn.ai-required-disabled[data-tooltip], .nav-btn.ai-required-disabled[data-tooltip]') : null;
        if (!button) return;
        showToolbarDisabledTooltip(button);
    });
    document.addEventListener('focusout', event => {
        const button = event.target instanceof Element ? event.target.closest('.tool-btn.ai-required-disabled[data-tooltip], .nav-btn.ai-required-disabled[data-tooltip]') : null;
        if (!button) return;
        hideToolbarDisabledTooltip();
    });
    window.addEventListener('scroll', hideToolbarDisabledTooltip, true);
    window.addEventListener('scroll', handleSpellcheckScroll, true);
    window.addEventListener('resize', hideToolbarDisabledTooltip);
    window.addEventListener('resize', hideSpellcheckTooltip);
}

export function bindEditorEvents() {
    bindEditorPaneSplitter({ syncPreviewScroll: schedulePreviewScrollSync, hideLinkTooltip });
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
    if (el.edPageInfo) {
        el.edPageInfo.onclick = insertPageInfoFrontMatter;
    }

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

    if (el.editToolbar) {
        el.editToolbar.addEventListener('scroll', updateEditToolbarScrollbar, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            const toolbarObserver = new ResizeObserver(() => {
                updateEditToolbarScrollbar();
            });
            toolbarObserver.observe(el.editToolbar);
        }
    }
    if (el.editToolbarScrollLeft) {
        el.editToolbarScrollLeft.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const step = Math.max(360, Math.floor((el.editToolbar?.clientWidth || 400) * 0.75));
            el.editToolbar?.scrollBy({ left: -step, behavior: 'smooth' });
        });
    }
    if (el.editToolbarScrollRight) {
        el.editToolbarScrollRight.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const step = Math.max(360, Math.floor((el.editToolbar?.clientWidth || 400) * 0.75));
            el.editToolbar?.scrollBy({ left: step, behavior: 'smooth' });
        });
    }
    window.addEventListener('resize', updateEditToolbarScrollbar, { passive: true });
    window.addEventListener('app:viewport-change', updateEditToolbarScrollbar, { passive: true });
    window.visualViewport?.addEventListener('resize', updateEditToolbarScrollbar, { passive: true });
}

function insertPageInfoFrontMatter() {
    if (!cmView) return;
    const content = cmView.state.doc.toString();
    const existing = parseDocumentFrontMatter(content);
    if (existing.hasFrontMatter) {
        cmView.dispatch({
            selection: { anchor: existing.yamlStart, head: existing.yamlEnd },
            scrollIntoView: true,
        });
        cmView.focus();
        showToast('Page Info already exists.');
        return;
    }

    const title = getFirstMarkdownLineTitle(content);
    const block = buildDocumentFrontMatter({
        title,
        author: state.editorAuthor || '',
        date: formatLocalISODate(),
        tags: ['tag1', 'tag2', 'tag3'],
        draft: false,
    });
    const insertAt = content.startsWith('\uFEFF') ? 1 : 0;
    cmView.dispatch({
        changes: { from: insertAt, insert: block },
        selection: EditorSelection.cursor(insertAt + block.length),
        scrollIntoView: true,
        userEvent: 'input',
    });
    cmView.focus();
    showToast('Page Info inserted. Click the draft value to toggle it.');
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
            const lineBlock = cmView.lineBlockAt(line.from);
            const editorScroller = cmView.scrollDOM;
            if (lineBlock && editorScroller) {
                editorScroller.scrollTo({
                    top: Math.max(0, lineBlock.top - 20),
                    behavior: 'smooth'
                });
            }
            scrollPreviewToEditorLine(targetLine);
            requestAnimationFrame(() => {
                scrollPreviewToEditorLine(targetLine);
            });
        });
    } catch (e) {
        console.warn('Failed to scroll editor to line:', lineNumber, e);
    }
}
