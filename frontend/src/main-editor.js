/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el } from './main-state.js';
import { updateNavButtons } from './main-navigation.js';
import { getActiveTab } from './main-tabs.js';
import { renderActiveTab, renderMarkdown } from './main-render.js';
import { showToast } from './main-ui.js';
import { SaveFile, AskConfirm } from '../wailsjs/go/main/App';
import { LogError } from '../wailsjs/runtime/runtime';

// ── Module-level State ─────────────────────────────────────
let lastLineCount = 0;
let currentEditorFontSize = 15;

// ── Editor Mode ────────────────────────────────────────────

export function enterEditMode() {
    if (state.isEditing) {
        handleCancel();
        return;
    }
    if (state.currentDocumentType !== 'markdown') return;
    
    state.isEditing = true;
    state.editorOriginalContent = state.currentMarkdownSource;
    el.markdownEditor.value = state.currentMarkdownSource;
    
    el.editToolbar.classList.remove('hidden');
    el.editorView.classList.remove('hidden');
    el.mainContainer.classList.add('is-editing');
    el.btnEdit.classList.add('active');
    
    // Ensure content view is visible for preview
    el.contentView.classList.remove('hidden'); 
    
    // Hide other non-editor UI
    el.btnSearchToggle.disabled = true;
    el.selectEngine.disabled = true;
    
    // 편집 중 네비게이션 버튼 비활성화
    el.btnBack.disabled = true;
    el.btnForward.disabled = true;
    el.btnHome.disabled = true;
    
    el.markdownEditor.focus();
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
    
    // 네비게이션 버튼 상태 복원
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
    const ok = await AskConfirm("Save Changes", "Do you want to save changes to the file?", "Save", "Cancel");
    if (!ok) return;
    
    try {
        await SaveFile(state.currentFilePath, el.markdownEditor.value);
        showToast("File saved successfully. ✅");
        await exitEditMode(true);
    } catch (error) {
        LogError(`Save failed: ${error}`);
        showToast("Failed to save file. ❌");
    }
}

async function handleCancel() {
    if (el.markdownEditor.value !== state.editorOriginalContent) {
        const ok = await AskConfirm("Unsaved Changes", "You have unsaved changes. Discard them?", "Discard", "Cancel");
        if (!ok) return;
    }
    exitEditMode(false);
}

// ── Text Insert ────────────────────────────────────────────

export function insertTextAtCursor(prefix, suffix) {
    const textarea = el.markdownEditor;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    textarea.value = before + prefix + selection + suffix + after;
    textarea.selectionStart = start + prefix.length;
    textarea.selectionEnd = start + prefix.length + selection.length;
    textarea.focus();

    // 동기화: 툴바 버튼 클릭 시에도 글로벌 및 탭 상태 업데이트
    state.currentMarkdownSource = textarea.value;
    const tab = getActiveTab();
    if (tab) tab.currentMarkdownSource = state.currentMarkdownSource;

    // Trigger preview update
    renderMarkdown(textarea.value);
}

// ── Custom Prompt Modal ────────────────────────────────────
/**
 * MacOS 브라우저 환경에서 window.prompt가 비정상 작동하는 문제를 해결하기 위한 커스텀 모달
 */
export function showCustomPrompt(title, message, defaultValue = "") {
    return new Promise((resolve) => {
        el.modalTitle.textContent = title;
        el.modalMessage.textContent = message;
        el.modalInput.value = defaultValue;
        el.modalOverlay.classList.remove('hidden');
        
        // 입력 필드 자동 포커스
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
        
        // Ensure input is visible
        el.modalInputGroup.classList.remove('hidden');
        el.modalEmojiGrid.classList.add('hidden');
    });
}

// ── Emoji Picker ───────────────────────────────────────────
/**
 * Emoji Picker Modal
 */
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
            '🤫', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥',
            '😮', '🤐', '😯', '😪', '😫', '🥱', '😴', '😌', '🤓', '😎',
            '🥳', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
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

        el.modalBtnOk.classList.add('hidden'); // Hide OK button as clicking emoji is enough
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
        const url = await showCustomPrompt("Insert Link", "Enter link URL:", "https://");
        if (url) insertTextAtCursor('[', `](${url})`);
    };
    
    el.edImage.onclick = async () => {
        const url = await showCustomPrompt("Insert Image", "Enter image URL or local path:", "https://");
        if (url) insertTextAtCursor('![', `](${url})`);
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

    el.edFontMinus.onclick = () => {
        currentEditorFontSize = Math.max(8, currentEditorFontSize - 1);
        el.markdownEditor.style.fontSize = `${currentEditorFontSize}px`;
    };

    el.edFontPlus.onclick = () => {
        currentEditorFontSize = Math.min(72, currentEditorFontSize + 1);
        el.markdownEditor.style.fontSize = `${currentEditorFontSize}px`;
    };
    
    el.edCancel.onclick = handleCancel;
    el.edSave.onclick = handleSave;
    
    el.markdownEditor.oninput = (e) => {
        const val = el.markdownEditor.value;
        state.currentMarkdownSource = val;
        const tab = getActiveTab();
        if (tab) tab.currentMarkdownSource = val;
        
        // 줄바꿈이 발생했거나 (추가/삭제), 특정 주요 변경 시 실시간 반영
        const currentLineCount = val.split('\n').length;
        if (currentLineCount !== lastLineCount || e.inputType === 'insertLineBreak' || val.endsWith('\n')) {
            renderMarkdown(val);
            lastLineCount = currentLineCount;
        }
    };
    
    // Support Tab key and Smart Lists in textarea
    el.markdownEditor.onkeydown = (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            insertTextAtCursor('    ', '');
            return;
        }

        if (e.key === 'Enter') {
            const textarea = e.target;
            const start = textarea.selectionStart;
            const text = textarea.value;
            const before = text.substring(0, start);
            const lines = before.split('\n');
            const lastLine = lines[lines.length - 1];
            
            // List and Task pattern: Indent + (Bullet/Number) + (Task) + Content
            const listRegex = /^(\s*)([*-]|\d+\.)(\s+\[([ x])\])?\s+(.*)$/;
            const match = lastLine.match(listRegex);
            
            if (match) {
                const indent = match[1];
                const bullet = match[2];
                const taskFull = match[3] || "";
                const content = match[5].trim();
                
                if (content === "") {
                    // Empty list item -> Stop listing by deleting the automatic prefix
                    e.preventDefault();
                    const newBefore = before.substring(0, start - lastLine.length);
                    textarea.value = newBefore + text.substring(textarea.selectionEnd);
                    textarea.selectionStart = textarea.selectionEnd = newBefore.length;
                    textarea.dispatchEvent(new Event('input'));
                } else {
                    // Continue listing automatically
                    e.preventDefault();
                    let nextBullet = bullet;
                    if (/^\d+\.$/.test(bullet)) {
                        const num = parseInt(bullet);
                        nextBullet = (num + 1) + ".";
                    }
                    const nextPrefix = `\n${indent}${nextBullet}${taskFull ? (taskFull.includes('[') ? ' [ ]' : '') : ''} `;
                    insertTextAtCursor(nextPrefix, '');
                }
            }
        }
    };
}
