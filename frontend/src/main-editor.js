/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el, getPathDirname } from './main-state.js';
import { updateNavButtons, openPath } from './main-navigation.js';
import { getActiveTab } from './main-tabs.js';
import { renderActiveTab, renderMarkdown } from './main-render.js';
import { showToast } from './main-ui.js';
import { SaveFile, SaveSettings, AskConfirm, SelectDocument, SelectImage, GetRelativePath, ShowSaveFileDialog, SyncEditorState } from '../wailsjs/go/main/App';
import { LogError } from '../wailsjs/runtime/runtime';

import { EditorState, Compartment, Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder, drawSelection, dropCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { ghostTextField, showPromptBoxAtSelection } from './main-ai.js';

// ── Module-level State ─────────────────────────────────────
let lastLineCount = 0;
let currentEditorFontSize = 15;
let slashMenuState = null;
let slashMenuEventsBound = false;
let lastPreviewCursorLine = 1;
let lastRenderedPreviewContent = "";
export let cmView = null;
export const themeCompartment = new Compartment();

export function getCurrentEditorText() {
    if (cmView) {
        return cmView.state.doc.toString();
    }
    return state.currentMarkdownSource || "";
}

function syncEditorStateToBackend() {
    const content = getCurrentEditorText();
    const hasUnsaved = state.isEditing && content !== state.editorOriginalContent;
    SyncEditorState(state.isEditing, hasUnsaved, state.currentFilePath || "", content).catch((error) => {
        LogError(`SyncEditorState failed: ${error}`);
    });
}

async function persistEditorPreferences() {
    await SaveSettings({
        theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
        fontSize: state.currentFontSize,
        engine: state.currentMarkdownEngine,
        editorRenderMode: state.currentEditorRenderMode,
        aiGeneralEnabled: window.aiState?.generalEnabled ?? true,
        aiGeneralProvider: window.aiState?.generalProvider || "openai",
        aiGeneralEndpoint: window.aiState?.generalEndpoint || "",
        aiGeneralModel: window.aiState?.generalModel || "qwen3.5-35b-a3b",
        aiGeneralKey: window.aiState?.generalKey || "",
        aiGeneralTemp: window.aiState?.generalTemp || 0,
        aiFimEnabled: window.aiState?.fimAvailable ?? true,
        aiFimEndpoint: window.aiState?.fimEndpoint || "",
        aiFimModel: window.aiState?.fimModel || "qwen2.5-coder-0.5b-instruct-mlx",
        aiFimKey: window.aiState?.fimKey || "",
        aiFimTemp: window.aiState?.fimTemp || 0,
        koreanImeEnterFix: state.koreanImeFixEnabled,
    });
}

function getCursorLineNumber(editorState = cmView?.state) {
    if (!editorState) return 1;
    return editorState.doc.lineAt(editorState.selection.main.head).number;
}

function schedulePreviewRender(content, delay = 100) {
    clearTimeout(window._renderTimer);
    window._renderTimer = setTimeout(() => {
        if (content === lastRenderedPreviewContent) return;
        renderMarkdown(content);
        lastRenderedPreviewContent = content;
        lastLineCount = cmView?.state.doc.lines ?? lastLineCount;
    }, delay);
}

function updatePreviewForEditorChange(update) {
    const nextDocText = update.state.doc.toString();
    const nextCursorLine = getCursorLineNumber(update.state);

    if (state.currentEditorRenderMode === 'realtime') {
        if (update.docChanged) {
            schedulePreviewRender(nextDocText, 100);
        }
        lastPreviewCursorLine = nextCursorLine;
        return;
    }

    if (update.selectionSet && nextCursorLine !== lastPreviewCursorLine) {
        schedulePreviewRender(nextDocText, 0);
    }
    lastPreviewCursorLine = nextCursorLine;
}

function getSlashCommands() {
    return [
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
        { id: 'latex', label: 'LaTeX', token: '$$', keywords: 'latex math equation', aliases: ['수식', '라텍스', '공식', 'ㅅㅅ'], run: () => insertLatex() },
        { id: 'emoji', label: 'Emoji', token: ':)', keywords: 'emoji emoticon smile', aliases: ['이모지', '이모티콘', '표정', 'ㅇㅁㅈ'], run: () => insertEmoji() },
    ];
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
                ...defaultKeymap,
                ...historyKeymap,
                indentWithTab
            ]),
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            themeCompartment.of(document.documentElement.classList.contains('dark') ? oneDark : []),
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
                if (update.docChanged) {
                    const val = update.state.doc.toString();
                    state.currentMarkdownSource = val;
                    const tab = getActiveTab();
                    if (tab) tab.currentMarkdownSource = val;
                    syncEditorStateToBackend();
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
    
    // hide old textarea
    if (el.markdownEditor) el.markdownEditor.style.display = 'none';

    // Apply font size
    cmView.contentDOM.style.fontSize = `${currentEditorFontSize}px`;
    cmView.contentDOM.style.fontFamily = 'var(--code-font)';
}

export function setEditorTheme(isDark) {
    if (cmView) {
        cmView.dispatch({
            effects: themeCompartment.reconfigure(isDark ? oneDark : [])
        });
    }
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
    if (el.edRenderMode) {
        el.edRenderMode.value = state.currentEditorRenderMode;
    }
    
    el.editToolbar.classList.remove('hidden');
    el.editorView.classList.remove('hidden');
    el.mainContainer.classList.add('is-editing');
    el.btnEdit.classList.add('active');
    
    el.contentView.classList.remove('hidden'); 
    
    el.btnSearchToggle.disabled = true;
    el.selectEngine.disabled = true;
    
    
    el.btnBack.disabled = true;
    el.btnForward.disabled = true;
    el.btnHome.disabled = true;
    
    // Also dispatch an empty ghost text just in case
    if (window.aiState) window.aiState.ghostText = "";
    updateSlashMenu();
    cmView.focus();
    updateNavButtons(); // 에디터 진입 시 버튼 아이콘/상태 전환을 위해 호출
    syncEditorStateToBackend();
}

export async function exitEditMode(didSave = false) {
    if (!state.isEditing) return;
    closeSlashMenu();
    clearTimeout(window._renderTimer);
    
    state.isEditing = false;
    state.editingSourcePath = "";
    state.editingSourceFolder = "";
    state.editingPreviewPath = "";
    state.editingPreviewFolder = "";
    el.editToolbar.classList.add('hidden');
    el.editorView.classList.add('hidden');
    el.mainContainer.classList.remove('is-editing');
    el.btnEdit.classList.remove('active');
    
    el.btnSearchToggle.disabled = false;
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

export async function saveCurrentDocument({ confirm = true, exitAfterSave = true } = {}) {
    if (!cmView) return;
    const contentToSave = cmView.state.doc.toString();
    const targetPath = state.editingSourcePath || state.currentFilePath;
    if (confirm) {
        const ok = await AskConfirm("Save Changes", "Do you want to save changes to the file?", "Save", "Cancel");
        if (!ok) return false;
    }
    
    try {
        await SaveFile(targetPath, contentToSave);
        showToast("File saved successfully. ✅");
        state.editorOriginalContent = contentToSave;
        state.currentMarkdownSource = contentToSave;
        state.editingPreviewPath = state.editingSourcePath || targetPath;
        state.editingPreviewFolder = state.editingSourceFolder || getPathDirname(targetPath);
        const tab = getActiveTab();
        if (tab) {
            tab.currentMarkdownSource = contentToSave;
            tab.editorOriginalContent = contentToSave;
        }
        syncEditorStateToBackend();
        if (exitAfterSave) {
            await exitEditMode(true);
        }
        return true;
    } catch (error) {
        LogError(`Save failed: ${error}`);
        showToast("Failed to save file. ❌");
        return false;
    }
}

async function handleSave() {
    await saveCurrentDocument({ confirm: true, exitAfterSave: true });
}

async function handleCancel() {
    if (hasUnsavedEditorChanges()) {
        const ok = await AskConfirm("Unsaved Changes", "You have unsaved changes. Discard them?", "Discard", "Cancel");
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
        const absPath = await SelectDocument();
        if (absPath) {
            const relPath = await GetRelativePath(state.currentFilePath, absPath);
            insertTextAtCursor('[', `](${relPath})`);
        }
        return;
    }

    const url = await showCustomPrompt("Insert Link", "Enter link URL:", "https://");
    if (url) insertTextAtCursor('[', `](${url})`);
}

async function insertImage() {
    const choice = await AskConfirm("Insert Image", "Would you like to enter an image URL manually or select a local image?", "Local File", "Manual URL");
    if (choice) {
        const absPath = await SelectImage();
        if (absPath) {
            const relPath = await GetRelativePath(state.currentFilePath, absPath);
            insertTextAtCursor('![', `](${relPath})`);
        }
        return;
    }

    const url = await showCustomPrompt("Insert Image", "Enter image URL:", "https://");
    if (url) insertTextAtCursor('![', `](${url})`);
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

export function showEmojiPicker() {
    return new Promise((resolve) => {
        el.modalTitle.textContent = "Select Emoji";
        el.modalMessage.textContent = "Click an emoji to insert it.";
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.add('hidden');
        el.modalEmojiGrid.classList.remove('hidden');
        el.modalOverlay.classList.remove('hidden');
        
        const emojiList = [
            '😀', '😃', '😄', '😁', '😅', '🤣', '😂', '🙂', '🙃', '😉', 
            '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '😜', '🤪',
            '🚀', '🔥', '✅', '❌', '📝', '📂', '💡', '⚠️', '⭐', '✨',
            '❤️', '🎉', '👍', '👎', '🙌', '👏', '🤝', '🙏', '💻', '📷'
        ];

        el.modalEmojiGrid.innerHTML = emojiList.map(emoji => `
            <div class="emoji-item" data-emoji="${emoji}">${emoji}</div>
        `).join('');

        const handleEmojiClick = (e) => {
            const item = e.target.closest('.emoji-item');
            if (item) {
                const emoji = item.dataset.emoji;
                cleanup();
                resolve(emoji);
            }
        };

        const handleCancelClick = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            el.modalEmojiGrid.removeEventListener('click', handleEmojiClick);
            el.modalBtnCancel.removeEventListener('click', handleCancelClick);
            el.modalBtnOk.classList.remove('hidden');
        };

        el.modalBtnOk.classList.add('hidden');
        el.modalEmojiGrid.addEventListener('click', handleEmojiClick);
        el.modalBtnCancel.addEventListener('click', handleCancelClick);
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
        if (!cmView) return;
        currentEditorFontSize = Math.max(8, currentEditorFontSize - 1);
        cmView.contentDOM.style.fontSize = `${currentEditorFontSize}px`;
    };

    el.edFontPlus.onclick = () => {
        if (!cmView) return;
        currentEditorFontSize = Math.min(72, currentEditorFontSize + 1);
        cmView.contentDOM.style.fontSize = `${currentEditorFontSize}px`;
    };
    
    el.edCancel.onclick = handleCancel;
    el.edSave.onclick = handleSave;
}
