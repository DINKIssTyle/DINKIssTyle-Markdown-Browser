/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el } from './main-state.js';
import { GetSettings, SaveSettings, MakeAIRequest, MakeLMStudioRequest } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { cmView, insertTextAtCursor } from './main-editor.js';
import { showToast } from './main-ui.js';
import { renderMarkdown } from './main-render.js';
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
        generalProvider: s.aiGeneralProvider || "openai",
        generalEndpoint: s.aiGeneralEndpoint || "",
        generalModel: s.aiGeneralModel || "gemma-4-e4b-it",
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
    el.aiGeneralProvider.value = aiState.generalProvider;
    el.aiGeneralEndpoint.value = aiState.generalEndpoint;
    el.aiGeneralModel.value = aiState.generalModel;
    el.aiGeneralKey.value = aiState.generalKey;
    el.aiGeneralTemp.value = aiState.generalTemp;
    el.aiFimEndpoint.value = aiState.fimEndpoint;
    el.aiFimModel.value = aiState.fimModel;
    el.aiFimKey.value = aiState.fimKey;
    el.aiFimTemp.value = aiState.fimTemp;
    el.aiToggleImeFix.checked = s.koreanImeEnterFix || false;
    state.koreanImeFixEnabled = el.aiToggleImeFix.checked;

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
        window.aiState.generalProvider = el.aiGeneralProvider.value;
        window.aiState.generalEndpoint = el.aiGeneralEndpoint.value;
        window.aiState.generalModel = el.aiGeneralModel.value || "gemma-4-e4b-it";
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
            aiGeneralProvider: window.aiState.generalProvider,
            aiGeneralEndpoint: window.aiState.generalEndpoint,
            aiGeneralModel: window.aiState.generalModel,
            aiGeneralKey: window.aiState.generalKey,
            aiGeneralTemp: window.aiState.generalTemp,
            aiFimEndpoint: window.aiState.fimEndpoint,
            aiFimModel: window.aiState.fimModel,
            aiFimKey: window.aiState.fimKey,
            aiFimTemp: window.aiState.fimTemp,
            koreanImeEnterFix: el.aiToggleImeFix.checked,
        });

        state.koreanImeFixEnabled = el.aiToggleImeFix.checked;

        el.aiSettingsModal.classList.add('hidden');
        showToast("AI Settings Saved.");
    };

    // AI Progress Events from Go
    EventsOn('ai:progress', (data) => {
        if (!el.aiProgressOverlay) return;

        el.aiProgressOverlay.classList.remove('hidden');
        if (data.loading) {
            el.aiProgressOverlay.classList.add('loading');
        } else {
            el.aiProgressOverlay.classList.remove('loading');
        }

        el.aiProgressLabel.textContent = data.label || "Processing...";
        const percent = Math.round(data.progress || 0);
        el.aiProgressPercent.textContent = data.loading ? "" : `${percent}%`;
        el.aiProgressBarFill.style.width = `${percent}%`;

        if (!data.loading && percent >= 100 && data.label === "완료 ✨") {
            setTimeout(() => {
                el.aiProgressOverlay.classList.add('hidden');
                el.aiProgressBarFill.style.width = '0%';
            }, 2000);
        }
    });

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
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            sendPrompt();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            hidePromptBox();
        }
    });

    // Detect selection for wand and typing for FIM
    document.addEventListener('selectionchange', handleSelectionChange);

    el.editorView.addEventListener('keydown', handleEditorKeydown, true);
    el.editorView.addEventListener('input', handleEditorInput, true);
}

function handleEditorInput() {
    if (!cmView || !window.aiState.fimEnabled || !window.aiState.fimEndpoint) return;

    // Typing should hide the wand
    if (!el.aiFloatingBtn.classList.contains('hidden')) {
        el.aiFloatingBtn.classList.add('hidden');
    }
    if (!el.aiPromptBox.classList.contains('hidden')) {
        hidePromptBox();
    }

    if (window.aiState.ghostText !== "") clearGhostText();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        requestFIM();
    }, 800);
}

function handleEditorKeydown(e) {
    if (!cmView) return;

    // IME 조합 중(한글 입력 중)에는 AI 관련 키 처리를 중단하여 중복 엔터 등 방지
    if (e.isComposing) return;

    if (window.aiState.ghostText !== "") {
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            insertTextAtCursor(window.aiState.ghostText, '');
            clearGhostText();
        } else if (e.key === 'Escape' || e.key === 'Enter') {
            // On Enter, we just clear ghost text and let the natural Enter happen
            // unless we want to prevent it. Here we just clear.
            clearGhostText();
        } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
            // Typable keys clear it anyway, but we do it gracefully
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

    // Skip showing wand during IME composition (Hangul typing)
    if (cmView.composing) {
        el.aiFloatingBtn.classList.add('hidden');
        return;
    }

    const sel = cmView.state.selection.main;
    if (sel.empty) {
        el.aiFloatingBtn.classList.add('hidden');
        if (!el.aiPromptBox.classList.contains('hidden')) {
            hidePromptBox();
        }
    } else {
        const isAllSelected = (sel.from === 0 && sel.to === cmView.state.doc.length);

        if (isAllSelected) {
            // Show prompt box at bottom center
            el.aiFloatingBtn.classList.add('hidden');
            showPromptBoxCentered();
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
}

function showPromptBoxCentered() {
    el.aiPromptBox.style.left = '50%';
    el.aiPromptBox.style.bottom = '40px';
    el.aiPromptBox.style.top = 'auto'; // Reset top
    el.aiPromptBox.style.transform = 'translateX(-50%)';
    el.aiPromptBox.classList.remove('hidden');
    // el.aiPromptInput.focus(); // Removed to avoid stealing focus during Select All
}

function showPromptBox() {
    const btnRect = el.aiFloatingBtn.getBoundingClientRect();
    el.aiPromptBox.style.left = `${btnRect.left}px`;
    el.aiPromptBox.style.top = `${btnRect.bottom + 10}px`;
    el.aiPromptBox.style.bottom = 'auto';
    el.aiPromptBox.style.transform = 'none';
    el.aiPromptBox.classList.remove('hidden');
    el.aiPromptInput.focus();
}

function hidePromptBox() {
    el.aiPromptBox.classList.add('hidden');
    el.aiPromptInput.value = "";
    if (cmView) cmView.focus();
}

function clearGhostText() {
    if (window.aiState.ghostText === "") return; // Avoid redundant dispatch
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
    
    // Hide prompt box immediately so user can see the editor
    hidePromptBox();
    
    el.aiPromptSend.disabled = true;
    showToast("AI Processing...");

    let endpoint = window.aiState.generalEndpoint.trim();
    if (!endpoint.startsWith("http")) endpoint = `http://${endpoint}`;

    try {
        let resultText = "";

        if (window.aiState.generalProvider === "lmstudio") {
            // LM Studio Native logic: baseUrl/api/v1/chat
            let base = endpoint.replace(/\/$/, "");
            base = base.replace(/\/api\/v1$/, "").replace(/\/v1$/, "");
            endpoint = base + "/api/v1/chat";

            const payload = {
                model: window.aiState.generalModel,
                input: `You are an AI Markdown editor assistant. Your job is to process the context text and return ONLY the raw modified text.\n\nContext: ${selectedText}\n\nInstruction: ${userPrompt}`,
                stream: true
            };
            if (window.aiState.generalTemp > 0) payload.temperature = window.aiState.generalTemp;

            const headers = { "Content-Type": "application/json" };
            if (window.aiState.generalKey) headers["Authorization"] = `Bearer ${window.aiState.generalKey}`;

            resultText = await MakeLMStudioRequest(endpoint, headers, JSON.stringify(payload));
        } else {
            // OpenAI Compatible logic: baseUrl/v1/chat/completions
            let base = endpoint.replace(/\/$/, "");
            if (!base.endsWith("/v1")) {
                base = base + "/v1";
            }
            endpoint = base + "/chat/completions";

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

            const responseJson = await MakeAIRequest(endpoint, headers, JSON.stringify(payload));
            const data = JSON.parse(responseJson);
            resultText = data.choices[0].message.content;
        }

        // Remove wrap codeblocks
        resultText = resultText.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');

        cmView.dispatch({
            changes: { from: sel.from, to: sel.to, insert: resultText }
        });

        renderMarkdown(cmView.state.doc.toString());
        showToast("AI Edit Applied! ✨");
    } catch (err) {
        console.error("AI prompt error", err);
        showToast("AI request failed. ❌");
        if (el.aiProgressOverlay) {
            el.aiProgressOverlay.classList.add('hidden');
        }
    } finally {
        el.aiPromptSend.disabled = false;
        // Don't close overlay here to show completion message
    }
}
