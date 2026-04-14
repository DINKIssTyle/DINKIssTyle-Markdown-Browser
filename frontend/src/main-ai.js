/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el } from './main-state.js';
import { GetSettings, SaveSettings, MakeAIRequest, MakeLMStudioRequest, GetAIModelCatalog, GetAIModelList, UnloadAIModel } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { cmView, insertPlainTextAtCursor } from './main-editor.js';
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
let fimRequestSeq = 0;
let latestAppliedFimSeq = 0;
let lastFimContextKey = "";
const FIM_PREFIX_LIMIT = 1200;
const FIM_SUFFIX_LIMIT = 400;
let lmStudioModels = [];
let lmStudioModelsLoading = false;
let lmStudioModelsError = "";
let unloadingInstanceId = "";
let fimModels = [];
let fimModelsLoading = false;
let fimModelsError = "";
let fimUnloadingInstanceId = "";

export async function initAI() {
    const s = await GetSettings();
    const aiState = {
        generalEnabled: s.aiGeneralEnabled !== false,
        generalProvider: s.aiGeneralProvider || "openai",
        generalEndpoint: s.aiGeneralEndpoint || "",
        generalModel: s.aiGeneralModel || "gemma-4-e4b-it",
        generalKey: s.aiGeneralKey || "",
        generalTemp: s.aiGeneralTemp || 0,
        fimAvailable: s.aiFimEnabled !== false,
        fimEndpoint: s.aiFimEndpoint || "",
        fimModel: s.aiFimModel || "qwen2.5-coder-0.5b-instruct-mlx",
        fimKey: s.aiFimKey || "",
        fimTemp: s.aiFimTemp || 0,
        fimEnabled: false,
        ghostText: "",
        ghostPos: 0,
    };

    // UI Load
    el.aiGeneralEnabled.checked = aiState.generalEnabled;
    el.aiGeneralProvider.value = aiState.generalProvider;
    el.aiGeneralEndpoint.value = aiState.generalEndpoint;
    el.aiGeneralModel.value = aiState.generalModel;
    el.aiGeneralKey.value = aiState.generalKey;
    el.aiGeneralTemp.value = aiState.generalTemp;
    el.aiFimEnabled.checked = aiState.fimAvailable;
    el.aiFimEndpoint.value = aiState.fimEndpoint;
    el.aiFimModel.value = aiState.fimModel;
    el.aiFimKey.value = aiState.fimKey;
    el.aiFimTemp.value = aiState.fimTemp;
    el.aiToggleImeFix.checked = s.koreanImeEnterFix || false;
    state.koreanImeFixEnabled = el.aiToggleImeFix.checked;
    window.aiState = aiState;
    syncAISettingsSections();
    syncAIControls();
    syncGeneralModelControl();
    updateGeneralModelTrigger();
    syncFimModelControl();
    updateFimModelTrigger();

    return aiState;
}

export function bindAIEvents() {
    el.aiGeneralEnabled.addEventListener('change', syncAISettingsSections);
    el.aiFimEnabled.addEventListener('change', syncAISettingsSections);
    el.aiGeneralProvider.addEventListener('change', handleGeneralProviderChange);
    el.aiGeneralEndpoint.addEventListener('change', handleGeneralEndpointChange);
    el.aiGeneralEndpoint.addEventListener('blur', handleGeneralEndpointChange);
    el.aiGeneralKey.addEventListener('change', handleGeneralEndpointChange);
    el.aiGeneralKey.addEventListener('blur', handleGeneralEndpointChange);
    el.aiGeneralModelTrigger.addEventListener('click', handleGeneralModelTriggerClick);
    el.aiGeneralModelList.addEventListener('click', handleGeneralModelListClick);
    el.aiFimEndpoint.addEventListener('change', handleFimEndpointChange);
    el.aiFimEndpoint.addEventListener('blur', handleFimEndpointChange);
    el.aiFimKey.addEventListener('change', handleFimEndpointChange);
    el.aiFimKey.addEventListener('blur', handleFimEndpointChange);
    el.aiFimModelTrigger.addEventListener('click', handleFimModelTriggerClick);
    el.aiFimModelList.addEventListener('click', handleFimModelListClick);
    document.addEventListener('click', handleDocumentClickForModelPopover);
    document.addEventListener('keydown', handleDocumentKeydownForModelPopover);

    // Settings Modal
    el.edSettings.onclick = () => {
        syncAISettingsSections();
        syncGeneralModelControl();
        syncFimModelControl();
        if (el.aiGeneralProvider.value === 'lmstudio') {
            refreshLMStudioModels({ keepOpen: false });
        }
        refreshFIMModels({ keepOpen: false });
        el.aiSettingsModal.classList.remove('hidden');
    };
    el.aiSettingsCancel.onclick = () => {
        closeGeneralModelPopover();
        closeFimModelPopover();
        el.aiSettingsModal.classList.add('hidden');
    };
    el.aiSettingsSave.onclick = async () => {
        window.aiState.generalEnabled = el.aiGeneralEnabled.checked;
        window.aiState.generalProvider = el.aiGeneralProvider.value;
        window.aiState.generalEndpoint = el.aiGeneralEndpoint.value;
        window.aiState.generalModel = el.aiGeneralModel.value || "gemma-4-e4b-it";
        window.aiState.generalKey = el.aiGeneralKey.value;
        window.aiState.generalTemp = parseFloat(el.aiGeneralTemp.value) || 0;
        window.aiState.fimAvailable = el.aiFimEnabled.checked;
        window.aiState.fimEndpoint = el.aiFimEndpoint.value;
        window.aiState.fimModel = el.aiFimModel.value || "qwen2.5-coder-0.5b-instruct-mlx";
        window.aiState.fimKey = el.aiFimKey.value;
        window.aiState.fimTemp = parseFloat(el.aiFimTemp.value) || 0;

        await SaveSettings({
            theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
            fontSize: state.currentFontSize,
            engine: state.currentMarkdownEngine,
            aiGeneralEnabled: window.aiState.generalEnabled,
            aiGeneralProvider: window.aiState.generalProvider,
            aiGeneralEndpoint: window.aiState.generalEndpoint,
            aiGeneralModel: window.aiState.generalModel,
            aiGeneralKey: window.aiState.generalKey,
            aiGeneralTemp: window.aiState.generalTemp,
            aiFimEnabled: window.aiState.fimAvailable,
            aiFimEndpoint: window.aiState.fimEndpoint,
            aiFimModel: window.aiState.fimModel,
            aiFimKey: window.aiState.fimKey,
            aiFimTemp: window.aiState.fimTemp,
            koreanImeEnterFix: el.aiToggleImeFix.checked,
        });

        state.koreanImeFixEnabled = el.aiToggleImeFix.checked;
        syncAIControls();

        closeGeneralModelPopover();
        closeFimModelPopover();
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

        const normalizedLabel = String(data.label || "").trim().toLowerCase();
        const isCompleted = !data.loading && (
            percent >= 100 ||
            normalizedLabel === "completed ✨" ||
            normalizedLabel === "completed" ||
            normalizedLabel === "완료 ✨" ||
            normalizedLabel === "완료"
        );

        if (isCompleted) {
            setTimeout(() => {
                el.aiProgressOverlay.classList.add('hidden');
                el.aiProgressOverlay.classList.remove('loading');
                el.aiProgressBarFill.style.width = '0%';
                el.aiProgressPercent.textContent = '';
            }, 2000);
        }
    });

    // FIM Toggle
    el.edFim.onclick = () => {
        if (!window.aiState.fimAvailable) {
            window.aiState.fimEnabled = false;
            syncAIControls();
            showToast("FIM is disabled in AI Settings.");
            return;
        }
        window.aiState.fimEnabled = !window.aiState.fimEnabled;
        syncAIControls();
        showToast(window.aiState.fimEnabled ? "AI FIM Enabled" : "AI FIM Disabled");
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
    if (!cmView || !window.aiState.fimAvailable || !window.aiState.fimEnabled || !window.aiState.fimEndpoint) return;
    if (cmView.composing) return;
    if (!cmView.state.selection.main.empty) return;

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
            insertPlainTextAtCursor(window.aiState.ghostText);
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
    if (!state.isEditing || !cmView || !window.aiState.generalEnabled) {
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
    if (window.aiState.ghostText !== "" && (sel.head !== window.aiState.ghostPos || !sel.empty)) {
        clearGhostText();
    }

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
    window.aiState.ghostPos = 0;
    lastFimContextKey = "";
    if (cmView) {
        cmView.dispatch({
            effects: setGhostTextEffect.of({ text: null, pos: 0 })
        });
    }
}

async function requestFIM() {
    if (!cmView || !window.aiState.fimAvailable || !window.aiState.fimEnabled) return;
    if (cmView.composing) return;

    const selection = cmView.state.selection.main;
    if (!selection.empty) return;

    const doc = cmView.state.doc.toString();
    const pos = selection.head;

    const prefix = doc.slice(Math.max(0, pos - FIM_PREFIX_LIMIT), pos);
    const suffix = doc.slice(pos, Math.min(doc.length, pos + FIM_SUFFIX_LIMIT));
    const contextKey = `${pos}:${prefix}:${suffix}`;

    if (!prefix.trim()) {
        clearGhostText();
        return;
    }

    lastFimContextKey = contextKey;
    const requestSeq = ++fimRequestSeq;

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
        if (requestSeq < fimRequestSeq) return;
        if (!cmView || cmView.composing) return;

        const currentSelection = cmView.state.selection.main;
        if (!currentSelection.empty) return;

        const currentDoc = cmView.state.doc.toString();
        const currentPos = currentSelection.head;
        const currentPrefix = currentDoc.slice(Math.max(0, currentPos - FIM_PREFIX_LIMIT), currentPos);
        const currentSuffix = currentDoc.slice(currentPos, Math.min(currentDoc.length, currentPos + FIM_SUFFIX_LIMIT));
        const currentContextKey = `${currentPos}:${currentPrefix}:${currentSuffix}`;
        if (currentContextKey !== contextKey || lastFimContextKey !== contextKey) return;

        const data = JSON.parse(responseJson);
        let ghostText = data?.choices?.[0]?.text || "";
        ghostText = sanitizeGhostText(ghostText, currentSuffix);

        if (ghostText) {
            latestAppliedFimSeq = requestSeq;
            window.aiState.ghostText = ghostText;
            window.aiState.ghostPos = currentPos;
            cmView.dispatch({
                effects: setGhostTextEffect.of({ text: ghostText, pos: currentPos })
            });
        } else if (requestSeq >= latestAppliedFimSeq) {
            clearGhostText();
        }
    } catch (err) {
        console.error("FIM error", err);
    }
}

function sanitizeGhostText(text, suffix = "") {
    if (!text) return "";

    let ghostText = text.replace(/\r\n/g, '\n');

    if (ghostText.startsWith('\n\n')) {
        ghostText = ghostText.replace(/^\n+/, '\n');
    }

    if (suffix) {
        while (ghostText && suffix.startsWith(ghostText)) {
            ghostText = ghostText.slice(0, -1);
        }
    }

    if (!ghostText.trim()) return "";
    if (ghostText.length > 120) {
        ghostText = ghostText.slice(0, 120);
    }

    return ghostText;
}

async function sendPrompt() {
    if (!window.aiState.generalEnabled) {
        hidePromptBox();
        showToast("General AI is disabled in AI Settings.");
        return;
    }

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

function syncAIControls() {
    const generalEnabled = !!window.aiState?.generalEnabled;
    const fimAvailable = !!window.aiState?.fimAvailable;
    const fimDisabledMessage = "FIM is disabled in AI Settings.";

    if (!fimAvailable) {
        window.aiState.fimEnabled = false;
        clearGhostText();
    }

    el.edFim.classList.toggle('active-fim', !!window.aiState?.fimEnabled && fimAvailable);
    el.edFim.classList.toggle('disabled', !fimAvailable);
    el.edFim.setAttribute('aria-disabled', String(!fimAvailable));
    el.edFim.title = fimAvailable ? "Toggle FIM (AI Autocomplete)" : fimDisabledMessage;
    if (fimAvailable) {
        el.edFim.removeAttribute('data-tooltip');
    } else {
        el.edFim.setAttribute('data-tooltip', fimDisabledMessage);
    }

    if (!generalEnabled) {
        el.aiFloatingBtn.classList.add('hidden');
        if (!el.aiPromptBox.classList.contains('hidden')) {
            hidePromptBox();
        }
    }
}

function syncAISettingsSections() {
    setSectionInputsEnabled('ai-general-enabled', [
        el.aiGeneralProvider,
        el.aiGeneralEndpoint,
        el.aiGeneralModel,
        el.aiGeneralModelTrigger,
        el.aiGeneralKey,
        el.aiGeneralTemp,
    ]);
    setSectionInputsEnabled('ai-fim-enabled', [
        el.aiFimEndpoint,
        el.aiFimModel,
        el.aiFimModelTrigger,
        el.aiFimKey,
        el.aiFimTemp,
    ]);
}

function handleGeneralProviderChange() {
    closeGeneralModelPopover();
    syncGeneralModelControl();
    if (el.aiGeneralProvider.value === 'lmstudio') {
        refreshLMStudioModels({ keepOpen: false });
    }
}

function handleGeneralEndpointChange() {
    if (el.aiGeneralProvider.value === 'lmstudio') {
        refreshLMStudioModels({ keepOpen: isGeneralModelPopoverOpen() });
    }
}

function syncGeneralModelControl() {
    const usePicker = el.aiGeneralProvider.value === 'lmstudio';
    el.aiGeneralModel.classList.toggle('hidden', usePicker);
    el.aiGeneralModelPicker.classList.toggle('hidden', !usePicker);
    updateGeneralModelTrigger();
    if (!usePicker) {
        closeGeneralModelPopover();
    }
}

async function refreshLMStudioModels({ keepOpen = false } = {}) {
    const endpointValue = el.aiGeneralEndpoint.value.trim();
    if (!endpointValue) {
        lmStudioModels = [];
        lmStudioModelsLoading = false;
        lmStudioModelsError = "";
        renderLMStudioModelPicker();
        syncGeneralModelControl();
        return;
    }
    lmStudioModelsLoading = true;
    lmStudioModelsError = "";
    renderLMStudioModelPicker();

    try {
        lmStudioModels = await fetchModelCatalogWithFallback(endpointValue, getGeneralAIHeaders());
    } catch (err) {
        console.error("LM Studio model list error", err);
        lmStudioModels = [];
        lmStudioModelsError = err?.message || "Failed to load models.";
    } finally {
        lmStudioModelsLoading = false;
        renderLMStudioModelPicker();
        updateGeneralModelTrigger();
        syncGeneralModelControl();
        if (!keepOpen) {
            closeGeneralModelPopover();
        }
    }
}

function handleFimEndpointChange() {
    refreshFIMModels({ keepOpen: isFimModelPopoverOpen() });
}

function syncFimModelControl() {
    const usePicker = fimModelsLoading || fimModels.length > 0;
    el.aiFimModel.classList.toggle('hidden', usePicker);
    el.aiFimModelPicker.classList.toggle('hidden', !usePicker);
    updateFimModelTrigger();
    if (!usePicker) {
        closeFimModelPopover();
    }
}

async function refreshFIMModels({ keepOpen = false } = {}) {
    const endpointValue = el.aiFimEndpoint.value.trim();
    if (!endpointValue) {
        fimModels = [];
        fimModelsLoading = false;
        fimModelsError = "";
        renderFimModelPicker();
        syncFimModelControl();
        return;
    }
    fimModelsLoading = true;
    fimModelsError = "";
    renderFimModelPicker();
    syncFimModelControl();

    try {
        fimModels = await fetchModelCatalogWithFallback(endpointValue, getFimAIHeaders());
    } catch (err) {
        console.error("FIM model list error", err);
        fimModels = [];
        fimModelsError = err?.message || "Failed to load models.";
    } finally {
        fimModelsLoading = false;
        renderFimModelPicker();
        updateFimModelTrigger();
        syncFimModelControl();
        if (!keepOpen) {
            closeFimModelPopover();
        }
    }
}

function renderLMStudioModelPicker() {
    const currentValue = el.aiGeneralModel.value || window.aiState?.generalModel || "";
    if (lmStudioModelsLoading) {
        el.aiGeneralModelStatus.textContent = "Loading models...";
        el.aiGeneralModelStatus.classList.remove('hidden');
        el.aiGeneralModelList.innerHTML = "";
        return;
    }
    if (lmStudioModelsError) {
        el.aiGeneralModelStatus.textContent = lmStudioModelsError;
        el.aiGeneralModelStatus.classList.remove('hidden');
        el.aiGeneralModelList.innerHTML = "";
        return;
    }
    if (!lmStudioModels.length) {
        el.aiGeneralModelStatus.textContent = "No LM Studio models found.";
        el.aiGeneralModelStatus.classList.remove('hidden');
        el.aiGeneralModelList.innerHTML = "";
        return;
    }
    el.aiGeneralModelStatus.classList.add('hidden');
    el.aiGeneralModelList.innerHTML = lmStudioModels.map((model) => {
        const selected = model.id === currentValue;
        const loadedBadge = model.isLoaded ? `<span class="ai-model-badge is-loaded">Loaded</span>` : '';
        const stateLabel = model.stateLabel ? `<span class="ai-model-state">${escapeHTMLAttr(model.stateLabel)}</span>` : '';
        const unloadDisabled = !model.primaryLoadedInstanceId || unloadingInstanceId === model.primaryLoadedInstanceId;
        const unloadLabel = unloadingInstanceId === model.primaryLoadedInstanceId ? 'Unloading...' : 'Unload';
        const unloadButton = model.isLoaded
            ? `<button type="button" class="ai-model-unload-btn" data-action="unload" data-instance-id="${escapeHTMLAttr(model.primaryLoadedInstanceId || '')}" ${unloadDisabled ? 'disabled' : ''}>${escapeHTMLAttr(unloadLabel)}</button>`
            : '';
        return `
            <div class="ai-model-item${selected ? ' is-selected' : ''}">
                <button type="button" class="ai-model-main" data-action="select" data-model-id="${escapeHTMLAttr(model.id)}">
                    <span class="ai-model-name">${escapeHTMLAttr(model.displayName || model.id)}</span>
                    <span class="ai-model-meta">${loadedBadge}${stateLabel}</span>
                </button>
                ${unloadButton}
            </div>
        `;
    }).join('');
}

function renderFimModelPicker() {
    const currentValue = el.aiFimModel.value || window.aiState?.fimModel || "";
    if (fimModelsLoading) {
        el.aiFimModelStatus.textContent = "Loading models...";
        el.aiFimModelStatus.classList.remove('hidden');
        el.aiFimModelList.innerHTML = "";
        return;
    }
    if (fimModelsError) {
        el.aiFimModelStatus.textContent = fimModelsError;
        el.aiFimModelStatus.classList.remove('hidden');
        el.aiFimModelList.innerHTML = "";
        return;
    }
    if (!fimModels.length) {
        el.aiFimModelStatus.textContent = "No FIM models found.";
        el.aiFimModelStatus.classList.remove('hidden');
        el.aiFimModelList.innerHTML = "";
        return;
    }
    el.aiFimModelStatus.classList.add('hidden');
    el.aiFimModelList.innerHTML = fimModels.map((model) => {
        const selected = model.id === currentValue;
        const loadedBadge = model.isLoaded ? `<span class="ai-model-badge is-loaded">Loaded</span>` : '';
        const stateLabel = model.stateLabel ? `<span class="ai-model-state">${escapeHTMLAttr(model.stateLabel)}</span>` : '';
        const unloadDisabled = !model.primaryLoadedInstanceId || fimUnloadingInstanceId === model.primaryLoadedInstanceId;
        const unloadLabel = fimUnloadingInstanceId === model.primaryLoadedInstanceId ? 'Unloading...' : 'Unload';
        const unloadButton = model.isLoaded
            ? `<button type="button" class="ai-model-unload-btn" data-action="unload" data-instance-id="${escapeHTMLAttr(model.primaryLoadedInstanceId || '')}" ${unloadDisabled ? 'disabled' : ''}>${escapeHTMLAttr(unloadLabel)}</button>`
            : '';
        return `
            <div class="ai-model-item${selected ? ' is-selected' : ''}">
                <button type="button" class="ai-model-main" data-action="select" data-model-id="${escapeHTMLAttr(model.id)}">
                    <span class="ai-model-name">${escapeHTMLAttr(model.displayName || model.id)}</span>
                    <span class="ai-model-meta">${loadedBadge}${stateLabel}</span>
                </button>
                ${unloadButton}
            </div>
        `;
    }).join('');
}

function escapeHTMLAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function setSectionInputsEnabled(toggleId, controls) {
    const enabled = document.getElementById(toggleId)?.checked ?? true;
    for (const control of controls) {
        if (control) {
            control.disabled = !enabled;
        }
    }
}

function getGeneralAIHeaders() {
    const headers = {};
    const key = el.aiGeneralKey.value.trim();
    if (key) {
        headers.Authorization = `Bearer ${key}`;
    }
    return headers;
}

function getFimAIHeaders() {
    const headers = {};
    const key = el.aiFimKey.value.trim();
    if (key) {
        headers.Authorization = `Bearer ${key}`;
    }
    return headers;
}

function updateGeneralModelTrigger() {
    if (!el.aiGeneralModelTriggerLabel) return;
    const currentValue = el.aiGeneralModel.value || window.aiState?.generalModel || "";
    const selectedModel = lmStudioModels.find((model) => model.id === currentValue);
    el.aiGeneralModelTriggerLabel.textContent = selectedModel?.displayName || currentValue || "Choose a model...";
    el.aiGeneralModelTrigger.classList.toggle('is-placeholder', !currentValue);
}

function updateFimModelTrigger() {
    if (!el.aiFimModelTriggerLabel) return;
    const currentValue = el.aiFimModel.value || window.aiState?.fimModel || "";
    const selectedModel = fimModels.find((model) => model.id === currentValue);
    el.aiFimModelTriggerLabel.textContent = selectedModel?.displayName || currentValue || "Choose a model...";
    el.aiFimModelTrigger.classList.toggle('is-placeholder', !currentValue);
}

function handleGeneralModelTriggerClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (el.aiGeneralModelTrigger.disabled) return;
    if (isGeneralModelPopoverOpen()) {
        closeGeneralModelPopover();
        return;
    }
    openGeneralModelPopover();
    if (!lmStudioModels.length && !lmStudioModelsLoading) {
        refreshLMStudioModels({ keepOpen: true });
    }
}

function openGeneralModelPopover() {
    if (el.aiGeneralProvider.value !== 'lmstudio') return;
    el.aiGeneralModelPopover.classList.remove('hidden');
    el.aiGeneralModelTrigger.setAttribute('aria-expanded', 'true');
}

function closeGeneralModelPopover() {
    el.aiGeneralModelPopover.classList.add('hidden');
    el.aiGeneralModelTrigger.setAttribute('aria-expanded', 'false');
}

function isGeneralModelPopoverOpen() {
    return !el.aiGeneralModelPopover.classList.contains('hidden');
}

function handleFimModelTriggerClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (el.aiFimModelTrigger.disabled) return;
    if (isFimModelPopoverOpen()) {
        closeFimModelPopover();
        return;
    }
    openFimModelPopover();
    if (!fimModels.length && !fimModelsLoading) {
        refreshFIMModels({ keepOpen: true });
    }
}

function openFimModelPopover() {
    el.aiFimModelPopover.classList.remove('hidden');
    el.aiFimModelTrigger.setAttribute('aria-expanded', 'true');
}

function closeFimModelPopover() {
    el.aiFimModelPopover.classList.add('hidden');
    el.aiFimModelTrigger.setAttribute('aria-expanded', 'false');
}

function isFimModelPopoverOpen() {
    return !el.aiFimModelPopover.classList.contains('hidden');
}

function handleDocumentClickForModelPopover(event) {
    if (isGeneralModelPopoverOpen() && !el.aiGeneralModelPicker.contains(event.target)) {
        closeGeneralModelPopover();
    }
    if (isFimModelPopoverOpen() && !el.aiFimModelPicker.contains(event.target)) {
        closeFimModelPopover();
    }
}

function handleDocumentKeydownForModelPopover(event) {
    if (event.key === 'Escape') {
        if (isGeneralModelPopoverOpen()) closeGeneralModelPopover();
        if (isFimModelPopoverOpen()) closeFimModelPopover();
    }
}

function handleGeneralModelListClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    event.preventDefault();
    event.stopPropagation();

    const action = actionTarget.dataset.action;
    if (action === 'select') {
        const modelID = actionTarget.dataset.modelId || "";
        if (!modelID) return;
        el.aiGeneralModel.value = modelID;
        updateGeneralModelTrigger();
        renderLMStudioModelPicker();
        closeGeneralModelPopover();
        return;
    }

    if (action === 'unload') {
        const instanceID = actionTarget.dataset.instanceId || "";
        if (!instanceID || unloadingInstanceId) return;
        unloadGeneralModelInstance(instanceID);
    }
}

function handleFimModelListClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    event.preventDefault();
    event.stopPropagation();

    const action = actionTarget.dataset.action;
    if (action === 'select') {
        const modelID = actionTarget.dataset.modelId || "";
        if (!modelID) return;
        el.aiFimModel.value = modelID;
        updateFimModelTrigger();
        renderFimModelPicker();
        closeFimModelPopover();
        return;
    }

    if (action === 'unload') {
        const instanceID = actionTarget.dataset.instanceId || "";
        if (!instanceID || fimUnloadingInstanceId) return;
        unloadFimModelInstance(instanceID);
    }
}

async function unloadGeneralModelInstance(instanceID) {
    try {
        unloadingInstanceId = instanceID;
        renderLMStudioModelPicker();
        await UnloadAIModel(el.aiGeneralEndpoint.value.trim(), getGeneralAIHeaders(), instanceID);
        showToast("Model unloaded.");
        await refreshLMStudioModels({ keepOpen: true });
    } catch (err) {
        console.error("LM Studio unload error", err);
        showToast(`Unload failed: ${err?.message || err}`);
    } finally {
        unloadingInstanceId = "";
        renderLMStudioModelPicker();
    }
}

async function unloadFimModelInstance(instanceID) {
    try {
        fimUnloadingInstanceId = instanceID;
        renderFimModelPicker();
        await UnloadAIModel(el.aiFimEndpoint.value.trim(), getFimAIHeaders(), instanceID);
        showToast("FIM model unloaded.");
        await refreshFIMModels({ keepOpen: true });
    } catch (err) {
        console.error("FIM unload error", err);
        showToast(`Unload failed: ${err?.message || err}`);
    } finally {
        fimUnloadingInstanceId = "";
        renderFimModelPicker();
    }
}

async function fetchModelCatalogWithFallback(endpointValue, headers) {
    const models = await GetAIModelCatalog(endpointValue, headers);
    const normalized = Array.isArray(models) ? models.filter(model => model?.id) : [];
    if (normalized.length > 0) {
        return normalized;
    }

    const fallbackList = await GetAIModelList(endpointValue, headers);
    return Array.isArray(fallbackList)
        ? fallbackList.filter(Boolean).map((id) => ({
            id,
            displayName: id,
            isLoaded: false,
            stateLabel: "",
            primaryLoadedInstanceId: "",
        }))
        : [];
}
