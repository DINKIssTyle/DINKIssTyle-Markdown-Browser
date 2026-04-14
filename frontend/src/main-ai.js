/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el } from './main-state.js';
import { GetSettings, SaveSettings, MakeAIRequest } from '../wailsjs/go/main/App';
import { cmView, insertTextAtCursor } from './main-editor.js';
import { showToast } from './main-ui.js';
import { StateField, StateEffect } from '@codemirror/state';
import { Decoration, WidgetType, EditorView } from '@codemirror/view';

export const setGhostTextEffect = StateEffect.define();

class GhostTextWidget extends WidgetType {
    constructor(text) {
        super();
        this.text = text;
    }
    toDOM() {
        const span = document.createElement("span");
        span.className = "cm-ghost-text";
        span.textContent = this.text;
        return span;
    }
}

export const ghostTextField = StateField.define({
    create() { return Decoration.none },
    update(deco, tr) {
        deco = deco.map(tr.changes);
        for (let e of tr.effects) {
            if (e.is(setGhostTextEffect)) {
                if (e.value.text) {
                    deco = Decoration.set([
                        Decoration.widget({
                            widget: new GhostTextWidget(e.value.text),
                            side: 1
                        }).range(e.value.pos)
                    ]);
                } else {
                    deco = Decoration.none;
                }
            }
        }
        return deco;
    },
    provide: f => EditorView.decorations.from(f)
});

let debounceTimer = null;

export async function initAI() {
    const s = await GetSettings();
    const aiState = {
        generalEndpoint: s.aiGeneralEndpoint || "",
        generalModel: s.aiGeneralModel || "qwen3.5-35b-a3b",
        generalKey: s.aiGeneralKey || "",
        generalTemp: s.aiGeneralTemp || 0,
        fimEndpoint: s.aiFimEndpoint || "",
        fimModel: s.aiFimModel || "qwen2.5-coder-0.5b-instruct-mlx",
        fimKey: s.aiFimKey || "",
        fimTemp: s.aiFimTemp || 0,
        fimEnabled: false,
        ghostText: "",
        ghostPos: 0,
    };

    // UI Load
    el.aiGeneralEndpoint.value = aiState.generalEndpoint;
    el.aiGeneralModel.value = aiState.generalModel;
    el.aiGeneralKey.value = aiState.generalKey;
    el.aiGeneralTemp.value = aiState.generalTemp;
    el.aiFimEndpoint.value = aiState.fimEndpoint;
    el.aiFimModel.value = aiState.fimModel;
    el.aiFimKey.value = aiState.fimKey;
    el.aiFimTemp.value = aiState.fimTemp;

    return aiState;
}

export function bindAIEvents() {
    // Settings Modal
    el.edSettings.onclick = () => {
        el.aiSettingsModal.classList.remove('hidden');
    };
    el.aiSettingsCancel.onclick = () => {
        el.aiSettingsModal.classList.add('hidden');
    };
    el.aiSettingsSave.onclick = async () => {
        window.aiState.generalEndpoint = el.aiGeneralEndpoint.value;
        window.aiState.generalModel = el.aiGeneralModel.value || "qwen3.5-35b-a3b";
        window.aiState.generalKey = el.aiGeneralKey.value;
        window.aiState.generalTemp = parseFloat(el.aiGeneralTemp.value) || 0;
        window.aiState.fimEndpoint = el.aiFimEndpoint.value;
        window.aiState.fimModel = el.aiFimModel.value || "qwen2.5-coder-0.5b-instruct-mlx";
        window.aiState.fimKey = el.aiFimKey.value;
        window.aiState.fimTemp = parseFloat(el.aiFimTemp.value) || 0;

        await SaveSettings({
            theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
            fontSize: state.currentFontSize,
            engine: state.currentMarkdownEngine,
            aiGeneralEndpoint: window.aiState.generalEndpoint,
            aiGeneralModel: window.aiState.generalModel,
            aiGeneralKey: window.aiState.generalKey,
            aiGeneralTemp: window.aiState.generalTemp,
            aiFimEndpoint: window.aiState.fimEndpoint,
            aiFimModel: window.aiState.fimModel,
            aiFimKey: window.aiState.fimKey,
            aiFimTemp: window.aiState.fimTemp,
        });

        el.aiSettingsModal.classList.add('hidden');
        showToast("AI Settings Saved.");
    };

    // FIM Toggle
    el.edFim.onclick = () => {
        window.aiState.fimEnabled = !window.aiState.fimEnabled;
        if (window.aiState.fimEnabled) {
            el.edFim.classList.add('active-fim');
            showToast("AI FIM Enabled");
        } else {
            el.edFim.classList.remove('active-fim');
            clearGhostText();
            showToast("AI FIM Disabled");
        }
    };

    // Wand toggle
    el.aiFloatingBtn.onclick = () => {
        if (el.aiPromptBox.classList.contains('hidden')) {
            showPromptBox();
        } else {
            hidePromptBox();
        }
    };

    el.aiPromptClose.onclick = hidePromptBox;
    el.aiPromptSend.onclick = sendPrompt;
    el.aiPromptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendPrompt();
        if (e.key === 'Escape') hidePromptBox();
    });

    // Detect selection for wand and typing for FIM
    document.addEventListener('selectionchange', handleSelectionChange);

    el.editorView.addEventListener('keydown', handleEditorKeydown, true);
    el.editorView.addEventListener('input', handleEditorInput, true);
}

function handleEditorInput() {
    if (!cmView || !window.aiState.fimEnabled || !window.aiState.fimEndpoint) return;

    clearGhostText();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        requestFIM();
    }, 600); // 600ms debounce
}

function handleEditorKeydown(e) {
    if (!cmView) return;
    if (window.aiState.ghostText !== "") {
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            insertTextAtCursor(window.aiState.ghostText, '');
            clearGhostText();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            clearGhostText();
        } else {
            clearGhostText();
        }
    }
}

function handleSelectionChange() {
    if (!state.isEditing || !cmView) {
        el.aiFloatingBtn.classList.add('hidden');
        if (!el.aiPromptBox.classList.contains('hidden')) {
            hidePromptBox();
        }
        return;
    }

    const sel = cmView.state.selection.main;
    if (sel.empty) {
        el.aiFloatingBtn.classList.add('hidden');
    } else {
        // Show floating button near selection
        const rect = cmView.coordsAtPos(sel.to);
        if (rect) {
            el.aiFloatingBtn.style.left = `${rect.right + 10}px`;
            el.aiFloatingBtn.style.top = `${rect.bottom - 15}px`;
            el.aiFloatingBtn.classList.remove('hidden');
        }
    }
}

function showPromptBox() {
    const btnRect = el.aiFloatingBtn.getBoundingClientRect();
    el.aiPromptBox.style.left = `${btnRect.left}px`;
    el.aiPromptBox.style.top = `${btnRect.bottom + 10}px`;
    el.aiPromptBox.classList.remove('hidden');
    el.aiPromptInput.focus();
}

function hidePromptBox() {
    el.aiPromptBox.classList.add('hidden');
    el.aiPromptInput.value = "";
    if (cmView) cmView.focus();
}

function clearGhostText() {
    window.aiState.ghostText = "";
    if (cmView) {
        cmView.dispatch({
            effects: setGhostTextEffect.of({ text: null, pos: 0 })
        });
    }
}

async function requestFIM() {
    if (!cmView || !window.aiState.fimEnabled) return;

    const doc = cmView.state.doc.toString();
    const pos = cmView.state.selection.main.head;

    const prefix = doc.slice(0, pos);
    const suffix = doc.slice(pos);

    const endpoint = window.aiState.fimEndpoint.startsWith("http") ? window.aiState.fimEndpoint : `http://${window.aiState.fimEndpoint}`;

    try {
        const headers = { "Content-Type": "application/json" };
        if (window.aiState.fimKey) headers["Authorization"] = `Bearer ${window.aiState.fimKey}`;

        const payload = {
            model: window.aiState.fimModel,
            prompt: `<|fim_prefix|>${prefix}<|fim_middle|><|fim_suffix|>${suffix}`,
            max_tokens: 64,
            stop: ["<|file_separator|>"]
        };
        if (window.aiState.fimTemp > 0) {
            payload.temperature = window.aiState.fimTemp;
        }

        const responseJson = await MakeAIRequest(`${endpoint}/v1/completions`, headers, JSON.stringify(payload));
        const data = JSON.parse(responseJson);
        let ghostText = data.choices[0].text;

        if (ghostText) {
            window.aiState.ghostText = ghostText;
            window.aiState.ghostPos = pos;
            cmView.dispatch({
                effects: setGhostTextEffect.of({ text: ghostText, pos: pos })
            });
        }
    } catch (err) {
        console.error("FIM error", err);
    }
}

async function sendPrompt() {
    const userPrompt = el.aiPromptInput.value.trim();
    if (!userPrompt || !cmView) return;

    const sel = cmView.state.selection.main;
    if (sel.empty) return;

    const selectedText = cmView.state.sliceDoc(sel.from, sel.to);
    el.aiPromptSend.disabled = true;
    showToast("AI Processing...");

    const endpoint = window.aiState.generalEndpoint.startsWith("http") ? window.aiState.generalEndpoint : `http://${window.aiState.generalEndpoint}`;

    try {
        const headers = { "Content-Type": "application/json" };
        if (window.aiState.generalKey) headers["Authorization"] = `Bearer ${window.aiState.generalKey}`;

        const payload = {
            model: window.aiState.generalModel,
            messages: [
                { role: "system", content: "You are an AI Markdown editor assistant. Your job is to process the context text and return ONLY the raw modified text (no wrappers like ```markdown)." },
                { role: "user", content: `Context: ${selectedText}\n\nInstruction: ${userPrompt}` }
            ]
        };
        if (window.aiState.generalTemp > 0) payload.temperature = window.aiState.generalTemp;

        const responseJson = await MakeAIRequest(`${endpoint}/v1/chat/completions`, headers, JSON.stringify(payload));
        const data = JSON.parse(responseJson);
        let resultText = data.choices[0].message.content;

        // Remove wrap codeblocks
        resultText = resultText.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');

        cmView.dispatch({
            changes: { from: sel.from, to: sel.to, insert: resultText }
        });

        hidePromptBox();
        showToast("AI Edit Applied! ✨");
    } catch (err) {
        console.error("AI prompt error", err);
        showToast("AI request failed. ❌");
    } finally {
        el.aiPromptSend.disabled = false;
    }
}
