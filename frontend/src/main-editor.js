/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el, getPathDirname } from './main-state.js';
import { updateNavButtons, openPath } from './main-navigation.js';
import { getActiveTab } from './main-tabs.js';
import { renderActiveTab, renderMarkdown } from './main-render.js';
import { showToast } from './main-ui.js';
import { SaveFile, AskConfirm, SelectDocument, SelectImage, GetRelativePath, ShowSaveFileDialog } from '../wailsjs/go/main/App';
import { LogError } from '../wailsjs/runtime/runtime';

import { EditorState, Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder, drawSelection, dropCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { ghostTextField } from './main-ai.js';

// ── Module-level State ─────────────────────────────────────
let lastLineCount = 0;
let currentEditorFontSize = 15;
export let cmView = null;
export const themeCompartment = new Compartment();

// ── Editor Mode ────────────────────────────────────────────

export function initCodeMirror() {
    if (cmView) return;
    
    // Create new CodeMirror view
    const startState = EditorState.create({
        doc: state.currentMarkdownSource || "",
        extensions: [
            lineNumbers(),
            history(),
            keymap.of([
                ...defaultKeymap,
                ...historyKeymap,
                indentWithTab
            ]),
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            themeCompartment.of(document.documentElement.classList.contains('dark') ? oneDark : []),
            ghostTextField,
            drawSelection(),
            dropCursor(),
            EditorView.lineWrapping,
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    const val = update.state.doc.toString();
                    state.currentMarkdownSource = val;
                    const tab = getActiveTab();
                    if (tab) tab.currentMarkdownSource = val;
                    
                    // Use a small delay for rendering to avoid UI stutter
                    clearTimeout(window._renderTimer);
                    window._renderTimer = setTimeout(() => {
                        const currentLineCount = update.state.doc.lines;
                        if (currentLineCount !== lastLineCount || val.endsWith('\n')) {
                            renderMarkdown(val);
                            lastLineCount = currentLineCount;
                        }
                    }, 100);
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
    
    cmView.dispatch({
        changes: { from: 0, to: cmView.state.doc.length, insert: state.currentMarkdownSource }
    });
    
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
    cmView.focus();
}

export async function exitEditMode(didSave = false) {
    if (!state.isEditing) return;
    
    state.isEditing = false;
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
}

async function handleSave() {
    if (!cmView) return;
    const contentToSave = cmView.state.doc.toString();
    const ok = await AskConfirm("Save Changes", "Do you want to save changes to the file?", "Save", "Cancel");
    if (!ok) return;
    
    try {
        await SaveFile(state.currentFilePath, contentToSave);
        showToast("File saved successfully. ✅");
        await exitEditMode(true);
    } catch (error) {
        LogError(`Save failed: ${error}`);
        showToast("Failed to save file. ❌");
    }
}

async function handleCancel() {
    if (cmView && cmView.state.doc.toString() !== state.editorOriginalContent) {
        const ok = await AskConfirm("Unsaved Changes", "You have unsaved changes. Discard them?", "Discard", "Cancel");
        if (!ok) return;
    }
    exitEditMode(false);
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

// ── Custom Prompt Modal ────────────────────────────────────
export function showCustomPrompt(title, message, defaultValue = "") {
    return new Promise((resolve) => {
        el.modalTitle.textContent = title;
        el.modalMessage.textContent = message;
        el.modalInput.value = defaultValue;
        el.modalOverlay.classList.remove('hidden');
        
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
        el.modalEmojiGrid.classList.add('hidden');
    });
}

export function showEmojiPicker() {
    return new Promise((resolve) => {
        el.modalTitle.textContent = "Select Emoji";
        el.modalMessage.textContent = "Click an emoji to insert it.";
        el.modalInputGroup.classList.add('hidden');
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
    el.edBold.onclick = () => insertTextAtCursor('**', '**');
    el.edItalic.onclick = () => insertTextAtCursor('*', '*');
    el.edStrike.onclick = () => insertTextAtCursor('~~', '~~');
    el.edQuote.onclick = () => insertTextAtCursor('\n> ', '');
    el.edH1.onclick = () => insertTextAtCursor('\n# ', '');
    el.edH2.onclick = () => insertTextAtCursor('\n## ', '');
    el.edH3.onclick = () => insertTextAtCursor('\n### ', '');
    el.edUl.onclick = () => insertTextAtCursor('\n- ', '');
    el.edOl.onclick = () => insertTextAtCursor('\n1. ', '');
    el.edHr.onclick = () => insertTextAtCursor('\n---\n', '');
    
    el.edLink.onclick = async () => {
        const choice = await AskConfirm("Insert Link", "Would you like to enter a URL manually or select a local file?", "Local File", "Manual URL");
        if (choice) {
            const absPath = await SelectDocument();
            if (absPath) {
                const relPath = await GetRelativePath(state.currentFilePath, absPath);
                insertTextAtCursor('[', `](${relPath})`);
            }
        } else {
            const url = await showCustomPrompt("Insert Link", "Enter link URL:", "https://");
            if (url) insertTextAtCursor('[', `](${url})`);
        }
    };
    
    el.edImage.onclick = async () => {
        const choice = await AskConfirm("Insert Image", "Would you like to enter an image URL manually or select a local image?", "Local File", "Manual URL");
        if (choice) {
            const absPath = await SelectImage();
            if (absPath) {
                const relPath = await GetRelativePath(state.currentFilePath, absPath);
                insertTextAtCursor('![', `](${relPath})`);
            }
        } else {
            const url = await showCustomPrompt("Insert Image", "Enter image URL:", "https://");
            if (url) insertTextAtCursor('![', `](${url})`);
        }
    };
    
    el.edCode.onclick = () => {
        insertTextAtCursor('\n\`\`\`\n', '\n\`\`\`\n');
    };
    
    el.edTable.onclick = async () => {
        const rowStr = await showCustomPrompt("Insert Table", "Number of rows:", "3");
        if (!rowStr) return;
        const colStr = await showCustomPrompt("Insert Table", "Number of columns:", "3");
        if (!colStr) return;

        const rows = parseInt(rowStr || "0");
        const cols = parseInt(colStr || "0");
        if (rows > 0 && cols > 0) {
            let table = '\n|';
            for (let c = 0; c < cols; c++) table += ` Header ${c+1} |`;
            table += '\n|';
            for (let c = 0; c < cols; c++) table += ' --- |';
            for (let r = 0; r < rows; r++) {
                table += '\n|';
                for (let c = 0; c < cols; c++) table += ` Cell |`;
            }
            table += '\n';
            insertTextAtCursor(table, '');
        }
    };
    
    el.edTask.onclick = () => insertTextAtCursor('\n- [ ] ', '');
    el.edLatex.onclick = async () => {
        const block = await AskConfirm("LaTeX Math", "Use block math ($$)?\n(Cancel for inline math $)", "Block ($$)", "Inline ($)");
        const tag = block ? '$$' : '$';
        insertTextAtCursor(tag, tag);
    };
    
    el.edEmoji.onclick = async () => {
        const choice = await showEmojiPicker();
        if (choice) insertTextAtCursor(choice, '');
    };

    el.edDiv.onclick = async () => {
        const align = await showCustomPrompt("DIV Wrapper", "Alignment (left/center/right):", "center");
        if (!align) return;
        const width = await showCustomPrompt("DIV Wrapper", "Width (e.g. 100%, 400px):", "100%");
        if (!width) return;

        let style = "";
        if (align === "center") {
            style = `display: block; margin: 0 auto; text-align: center; width: ${width};`;
        } else if (align === "right") {
            style = `display: block; margin-left: auto; text-align: right; width: ${width};`;
        } else {
            style = `text-align: left; width: ${width};`;
        }

        insertTextAtCursor(`<div style="${style}">\n`, '\n</div>');
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
