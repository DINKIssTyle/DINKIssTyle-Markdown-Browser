/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el } from './main-state.js';
import {
    applyMainToolbarVisibility,
    collectMainToolbarSettingsFromControls,
    persistAppSettings,
    syncMainToolbarSettingsControls,
} from './main-settings.js';
import { GetSettings, MakeAIRequest, MakeLMStudioRequest, GetAIModelCatalog, GetAIModelList, UnloadAIModel, CancelAIRequest, GetSystemFonts } from '../wailsjs/go/app/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { cmView, insertPlainTextAtCursor, EDITOR_TOKEN_COLOR_FIELDS, EDITOR_TOKEN_COLOR_PRESETS, getEditorDefaultTokenColors, getEditorDefaultBackgroundColor, applyEditorTokenColors, applyEditorBackgroundColor, applyEditorToolbarMode, isSpellcheckActive } from './main-editor.js';
import { beginProgressTask, finishProgressTask, showProgressDelta, showToast, updateProgress } from './main-ui.js';
import { renderMarkdown } from './main-render.js';
import { AI_SUPPORT_AGENT_POP_MS, AI_SUPPORT_AGENT_POP_ORIGIN, AI_SUPPORT_AGENT_POP_SCALE } from './config.js';
import { isCancellationError } from './main-cancel.js';
import { createDeltaTicker, normalizeDeltaText } from './main-delta-ticker.js';
import { applyAccentColors, DARK_ACCENT_PRESETS, DEFAULT_DARK_ACCENT_COLOR, DEFAULT_LIGHT_ACCENT_COLOR, LIGHT_ACCENT_PRESETS, normalizeAccentColor, applyDocumentMarginStyle, applyViewerFontFamily } from './main-theme.js';
import gfmReference from './prompts/GFM.md?raw';
import { EditorSelection, StateField, StateEffect } from '@codemirror/state';
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
const FIM_PREFIX_LIMIT = 600;
const FIM_SUFFIX_LIMIT = 200;
let lmStudioModels = [];
let lmStudioModelsLoading = false;
let lmStudioModelsError = "";
let unloadingInstanceId = "";
let aiRequestInFlight = false;
let aiRequestQueue = [];
let activeAIQueueJob = null;
let nextAIQueueJobId = 0;
let aiPromptHideTimer = null;
let aiPromptBusyState = null;
let aiProgressTaskId = 0;
let supportAgentPromptText = "";
let supportAgentTransitionTimer = null;
let lastPromptInputValue = "";
let aiPromptForcedVisible = false;
let settingsAccentSnapshot = null;
let settingsFormBaseline = "";
let lastSettingsTab = 'appearance';
let systemFontsPromise = null;
let systemFontsLoaded = false;
let aiDockHideTimer = null;
let aiPanelHideTimer = null;
let aiReasoningTickerIndex = 0;
const AI_PROMPT_BASE_WIDTH = 320;
const AI_PROMPT_MAX_WIDTH = Math.round(AI_PROMPT_BASE_WIDTH * 1.3);
const AI_PROMPT_INPUT_MAX_LINES = 5;
const AI_SUPPORT_REPORT_MAX_LINES = 5;
const AI_PROMPT_DEFAULT_PLACEHOLDER = "Press / to Ask AI...";
const AI_PROMPT_FOCUSED_PLACEHOLDER = "Ask AI ...";
const AI_EDIT_CONTEXT_LIMIT = 300;
const GENERAL_TEMP_AUTO_LABEL = "Auto";
const SUPPORT_REPORT_MAX_CHARS = 600;
const SUPPORT_AGENT_FALLBACK_REPORT = "Work is done, but I couldn't prepare an appropriate response. Please try again.";
const AI_DOCK_FADE_MS = 180;
const AI_DELTA_TICKER_INTERVAL_MS = 170;
const AI_DELTA_TICKER_HIDE_MS = 850;
const AI_DELTA_TICKER_COALESCE_MS = 220;
const AI_DELTA_TICKER_MIN_CHARS = 18;
const AI_DELTA_TICKER_MAX_QUEUE = 18;
const AI_DELTA_TICKER_MAX_CHARS = 72;
const AI_REASONING_TICKER_LABELS = Object.freeze([
    "Thinking",
    "Checking context",
    "Planning",
    "Composing",
]);
const AI_EDIT_RULES = Object.freeze({
    selectedTextOnly: 'You must edit ONLY the text inside <selected_text>.',
    responseOnlyReplacement: 'Your entire response must be only the replacement for <selected_text>.',
    noChangeKeepOriginal: 'If the instruction does not require a change, return the original <selected_text> unchanged.',
    noExtras: 'Do not add explanations, code fences, labels, or quotes.',
});

const AI_CONTEXT_RULES = Object.freeze({
    referenceOnlyOutput: 'The surrounding context is REFERENCE ONLY. Never rewrite it, never continue it, and never include it in the output.',
    referenceOnlyReplacement: 'The surrounding context is REFERENCE ONLY. Never rewrite it, never continue it, and never include it in the replacement.',
});

const AI_SHARED_RULE_PROMPT_LINES = Object.freeze([
    'You operate as a completely stateless agent. You do not retain memory of previous interactions or understand continuous context.',
    'Treat every request as an isolated, independent task. You cannot process multi-turn or continuous user requests.',
    'You have no access to the internet, real-time data, the current time, or geographic location. Do not attempt to provide or guess this information.',
    'You must respond in the same language as the user.',
]);

const AI_INTENT_VALUES = Object.freeze({
    edit: 'edit',
    question: 'question',
    ambiguous: 'ambiguous',
});

const SUPPORT_AGENT_PROMPT_LINES = Object.freeze([
    'First decide whether the user request is an edit, a question, or ambiguous.',
    'When <selected_text> exists, requests to translate, rewrite, summarize, shorten, expand, polish, fix grammar, change tone, change language, or convert format are edit requests.',
    'Short commands such as "translate to Korean", "한국어로 번역", "번역", "교정", "요약", or "다듬어줘" must use <intent>edit</intent> and put the transformed text in <replacement>.',
    'Do not answer that you will perform an edit; perform the edit by replacing <selected_text>.',
    'Return your response using exactly these XML blocks in this order:',
    '<intent>edit|question|ambiguous</intent>',
    '<support_report>short task review or answer for the user</support_report>',
    '<replacement>replacement text only</replacement>',
    'Write <support_report> in the language requested by the user within <instruction>.',
    `Keep <support_report> brief and within ${SUPPORT_REPORT_MAX_CHARS} characters or fewer.`,
    'If <intent> is edit, <replacement> must contain only the replacement text for <selected_text>.',
    'If <intent> is question or ambiguous, do not edit <selected_text> and return an empty <replacement></replacement>.',
    'Do not use code fences.',
]);

const ASK_AI_PROMPT_LINES = Object.freeze([
    'There is no <selected_text> in this request.',
    'First decide whether the user request is an insertion edit, a question, or ambiguous.',
    'If the user asks you to write, create, generate, insert, draft, compose, or make content for the document, use <intent>edit</intent> and put that new content in <replacement>.',
    'For requests such as "write a table", "insert a list", "마크다운 역사 100자", "표로 입력", "작성", or "생성", create the requested document content in <replacement>.',
    'Return your response using exactly these XML blocks in this order:',
    '<intent>edit|question|ambiguous</intent>',
    '<support_report>short answer for the user</support_report>',
    '<replacement>new document content only when intent is edit</replacement>',
    'If <intent> is question or ambiguous, keep <replacement></replacement> empty.',
    `Keep <support_report> short, concise, and within ${SUPPORT_REPORT_MAX_CHARS} characters.`,
    'Do not use code fences, labels, or extra wrappers.',
]);

function isAIFeaturesDisabled() {
    return !!state.aiFeaturesDisabled;
}

function isGeneralAIAvailable() {
    return !isAIFeaturesDisabled() && !!window.aiState?.generalAvailable;
}

function isGeneralAIToolbarEnabled() {
    return isGeneralAIAvailable() && !!window.aiState?.generalToolbarEnabled;
}

function isFIMAvailable() {
    return !isAIFeaturesDisabled() && !!window.aiState?.fimAvailable;
}

function isFIMEnabled() {
    return isFIMAvailable() && !!window.aiState?.fimEnabled;
}

function isGeneralAIActive() {
    return isGeneralAIToolbarEnabled();
}

function clampTemperature(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.max(0, Math.min(1, Math.round(numericValue * 10) / 10));
}

function formatTemperatureLabel(value) {
    const normalized = clampTemperature(value);
    return normalized <= 0 ? GENERAL_TEMP_AUTO_LABEL : normalized.toFixed(1);
}

function syncGeneralTemperatureControl() {
    if (!el.edGeneralTempSlider || !el.edGeneralTempValue || !el.aiGeneralTemp) return;

    const generalAvailable = isGeneralAIAvailable();
    const generalToolbarEnabled = isGeneralAIToolbarEnabled();
    const nextTemp = clampTemperature(window.aiState?.generalTemp || 0);
    const nextLabel = formatTemperatureLabel(nextTemp);

    el.edGeneralTempSlider.value = String(nextTemp);
    el.edGeneralTempSlider.disabled = !generalAvailable;
    el.edGeneralTempValue.textContent = nextLabel;
    el.edGeneralTempValue.disabled = !generalAvailable;
    el.edGeneralTempValue.setAttribute(
        'aria-label',
        nextTemp <= 0 ? 'Set General AI temperature to Auto' : `General AI temperature ${nextLabel}`
    );
    el.edGeneralTempControl.classList.toggle('disabled', !generalAvailable);
    el.edGeneralTempControl.classList.toggle('is-active', generalToolbarEnabled);
    el.aiGeneralTemp.value = String(nextTemp);
}

async function setGeneralTemperature(value, { persist = true } = {}) {
    const nextTemp = clampTemperature(value);
    window.aiState.generalTemp = nextTemp;
    syncGeneralTemperatureControl();
    if (persist) {
        await persistAISettings();
    }
}

function getPromptBusyPlaceholder(label = "") {
    const normalizedLabel = String(label || "").trim().toLowerCase();
    if (normalizedLabel.includes('receiv')) return 'Receiving response...';
    if (normalizedLabel.includes('model') || normalizedLabel.includes('load')) return 'Loading model...';
    return 'Processing prompt...';
}

function getAIQueuedCount() {
    return aiRequestQueue.length;
}

function getAIProgressTitle(title = "") {
    const queuedCount = getAIQueuedCount();
    if (queuedCount <= 0) {
        return title;
    }
    return `${title} · ${queuedCount} remaining`;
}

function updatePromptBusyUI() {
    const isBusy = false;
    const isSupportAgentVisible = !!supportAgentPromptText;
    const isPromptInputActive = !isSupportAgentVisible && isPromptBoxVisible() && document.activeElement === el.aiPromptInput;
    const promptValue = isSupportAgentVisible ? supportAgentPromptText : lastPromptInputValue;

    el.aiPromptBox.classList.toggle('is-busy', isBusy);
    el.aiPromptBox.classList.toggle('is-support-agent', isSupportAgentVisible);
    el.aiPromptBox.classList.toggle('is-cancelable', isBusy);
    el.aiPromptBox.classList.toggle('is-resetting-progress', !isBusy);
    el.aiPromptInput.disabled = isBusy;
    el.aiPromptInput.readOnly = isSupportAgentVisible;
    el.aiPromptSend.disabled = isBusy || isSupportAgentVisible;
    el.aiPromptSend.classList.toggle('hidden', isBusy || isSupportAgentVisible);
    el.aiPromptClose.title = isBusy ? 'Cancel AI Response' : 'Close AI Prompt';
    el.aiPromptClose.setAttribute('aria-label', isBusy ? 'Cancel AI Response' : 'Close AI Prompt');
    if (el.aiPromptBadgeIcon) {
        el.aiPromptBadgeIcon.textContent = isSupportAgentVisible ? 'support_agent' : 'wand_stars';
    }

    el.aiPromptBox.style.setProperty(
        '--ai-prompt-max-lines',
        String(isSupportAgentVisible ? AI_SUPPORT_REPORT_MAX_LINES : AI_PROMPT_INPUT_MAX_LINES)
    );

    el.aiPromptBox.style.setProperty('--ai-prompt-progress', '0%');
    el.aiPromptInput.disabled = false;
    if (!isPromptInputActive) {
        el.aiPromptInput.value = promptValue;
    }
    if (isSupportAgentVisible) {
        el.aiPromptInput.placeholder = '';
    } else {
        updatePromptPlaceholder();
    }
    updatePromptInputLayout();
}

function updatePromptPlaceholder() {
    if (aiPromptBusyState) {
        return;
    }
    el.aiPromptInput.placeholder = document.activeElement === el.aiPromptInput
        ? AI_PROMPT_FOCUSED_PLACEHOLDER
        : AI_PROMPT_DEFAULT_PLACEHOLDER;
}

function showPromptBusyState({ label = "", progress = 0 } = {}) {
    const nextProgress = Math.max(
        aiPromptBusyState?.progress ?? 0,
        Math.max(0, Math.min(100, Math.round(progress || 0)))
    );
    aiPromptBusyState = {
        label,
        progress: nextProgress,
        placeholder: getPromptBusyPlaceholder(label),
        inputText: aiPromptBusyState?.inputText || "",
    };
    const progressTitle = getAIProgressTitle(aiPromptBusyState.placeholder);
    if (!aiProgressTaskId) {
        aiProgressTaskId = beginProgressTask(progressTitle, nextProgress);
    } else {
        updateProgress(progressTitle, nextProgress);
    }
    updatePromptBusyUI();
    showAIWaitingTicker();
}

function showAIDeltaTicker(kind = "message", text = "") {
    const isReasoning = kind === "reasoning";
    showProgressDelta(isReasoning ? `Reasoning: ${text}` : text);
}

function showAIWaitingTicker() {
    if (!aiPromptBusyState) {
        return;
    }
    showProgressDelta("Preparing response");
}

const aiDeltaTicker = createDeltaTicker({
    render: item => {
        if (typeof item === "string") {
            showAIDeltaTicker("message", item);
            return;
        }
        showAIDeltaTicker(item.kind, item.text);
    },
    clearRender: clearRenderedAIDeltaTicker,
    normalize: normalizeDeltaText,
    intervalMs: AI_DELTA_TICKER_INTERVAL_MS,
    coalesceMs: AI_DELTA_TICKER_COALESCE_MS,
    minChars: AI_DELTA_TICKER_MIN_CHARS,
    maxQueue: AI_DELTA_TICKER_MAX_QUEUE,
    maxChars: AI_DELTA_TICKER_MAX_CHARS,
    canShow: () => !!aiRequestInFlight || !!aiPromptBusyState,
    merge: (lastQueued, nextItem) => {
        if (lastQueued.kind !== "message" || nextItem.kind !== "message") {
            return null;
        }
        return { kind: "message", text: `${lastQueued.text}${nextItem.text}` };
    },
});

function queueAIDeltaTicker(kind = "message", text = "") {
    if (!aiRequestInFlight && !aiPromptBusyState) {
        return;
    }

    if (kind === "reasoning") {
        aiDeltaTicker.enqueue({
            kind: "reasoning",
            text: `${AI_REASONING_TICKER_LABELS[aiReasoningTickerIndex++ % AI_REASONING_TICKER_LABELS.length]}...`,
        });
        return;
    }

    aiDeltaTicker.push(text);
}

function clearRenderedAIDeltaTicker() {
    aiReasoningTickerIndex = 0;
    el.aiPromptBox?.classList.remove('is-streaming-delta', 'is-awaiting-delta');
    el.aiPromptStreamTicker?.classList.remove('is-visible', 'is-reasoning', 'is-waiting');
    if (el.aiPromptStreamTicker) {
        el.aiPromptStreamTicker.hidden = true;
    }
    if (el.aiPromptStreamKind) {
        el.aiPromptStreamKind.textContent = "";
    }
    if (el.aiPromptStreamText) {
        el.aiPromptStreamText.textContent = "";
    }
}

function clearAIDeltaTicker() {
    aiDeltaTicker.clear();
}

function setPromptBusyInputText(value = "") {
    if (!aiPromptBusyState) {
        return;
    }
    aiPromptBusyState = {
        ...aiPromptBusyState,
        inputText: String(value || ""),
    };
    updateProgress(getAIProgressTitle(String(value || aiPromptBusyState.placeholder)), aiPromptBusyState.progress);
    updatePromptBusyUI();
}

function clearPromptBusyState() {
    aiPromptBusyState = null;
    if (aiProgressTaskId) {
        finishProgressTask(aiProgressTaskId);
        aiProgressTaskId = 0;
    }
    updatePromptBusyUI();
}

function normalizeSupportReport(reportText) {
    const report = String(reportText || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!report) {
        return SUPPORT_AGENT_FALLBACK_REPORT;
    }
    return report.slice(0, SUPPORT_REPORT_MAX_CHARS).trim() || SUPPORT_AGENT_FALLBACK_REPORT;
}

function isSupportAgentPromptVisible() {
    return !!supportAgentPromptText;
}

function showSupportAgentPrompt(reportText) {
    clearAIDeltaTicker();
    supportAgentPromptText = normalizeSupportReport(reportText);
    positionPromptBox();
    showPromptBoxElement();
    if (el.aiPromptBox) {
        el.aiPromptBox.classList.remove('is-transitioning-to-support');
        if (supportAgentTransitionTimer) {
            clearTimeout(supportAgentTransitionTimer);
        }
        requestAnimationFrame(() => {
            if (!isEditorPromptAvailable() || el.aiPromptBox?.classList.contains('hidden')) return;
            el.aiPromptBox.classList.add('is-transitioning-to-support');
            supportAgentTransitionTimer = setTimeout(() => {
                el.aiPromptBox?.classList.remove('is-transitioning-to-support');
                supportAgentTransitionTimer = null;
            }, AI_SUPPORT_AGENT_POP_MS);
        });
    }
    updatePromptBusyUI();
}

function showSupportAgentPromptForRequestTab(requestContext, reportText) {
    if (isActiveAIRequestTab(requestContext)) {
        showSupportAgentPrompt(reportText);
        return;
    }
    const requestTab = getAIRequestTab(requestContext);
    if (requestTab) {
        requestTab.pendingAISupportReport = normalizeSupportReport(reportText);
    }
}

function showPendingSupportAgentPromptForActiveTab() {
    const activeTab = state.tabs.find(tab => tab.id === state.activeTabId);
    if (!activeTab?.pendingAISupportReport || !isActiveAIRequestTab({
        tabId: activeTab.id,
        path: activeTab.editingSourcePath || activeTab.path,
    })) {
        return;
    }
    const reportText = activeTab.pendingAISupportReport;
    activeTab.pendingAISupportReport = "";
    showSupportAgentPrompt(reportText);
}

function applyAIPromptMotionConfig() {
    if (!el.aiPromptBox) return;
    el.aiPromptBox.style.setProperty('--ai-support-agent-pop-duration', `${AI_SUPPORT_AGENT_POP_MS}ms`);
    el.aiPromptBox.style.setProperty('--ai-support-agent-pop-scale', String(AI_SUPPORT_AGENT_POP_SCALE));
    el.aiPromptBox.style.setProperty('--ai-support-agent-pop-origin', AI_SUPPORT_AGENT_POP_ORIGIN);
}

function clearSupportAgentPrompt({ focusInput = false } = {}) {
    if (!isSupportAgentPromptVisible()) return;
    supportAgentPromptText = "";
    updatePromptBusyUI();
    if (focusInput) {
        requestAnimationFrame(() => {
            if (!isEditorPromptAvailable() || el.aiPromptBox?.classList.contains('hidden')) return;
            if (!el.aiPromptInput.disabled) {
                el.aiPromptInput.focus();
                updatePromptPlaceholder();
            }
        });
    }
}

function hideAIProgressOverlay() {
    clearAIDeltaTicker();
    clearPromptBusyState();
}

function isAIProgressVisible() {
    return !!aiPromptBusyState;
}

async function cancelActiveAIRequest() {
    if (!aiRequestInFlight) {
        const nextJob = aiRequestQueue.shift();
        if (nextJob) {
            nextJob.cancelled = true;
            nextJob.reject?.(new Error('context canceled'));
            showToast("Queued AI request cancelled.");
            updateActiveAIProgressQueueLabel();
            queueMicrotask(processAIRequestQueue);
            return;
        }
        clearPromptBusyState();
        return;
    }

    if (activeAIQueueJob) {
        activeAIQueueJob.cancelled = true;
    }
    aiRequestInFlight = false;
    try {
        await CancelAIRequest();
    } catch (error) {
        console.error('Failed to cancel AI request', error);
    }
    showToast("AI request cancelled.");
}

function updateActiveAIProgressQueueLabel() {
    if (!aiPromptBusyState) {
        return;
    }
    updateProgress(getAIProgressTitle(aiPromptBusyState.placeholder), aiPromptBusyState.progress);
}

function getEditorSelection() {
    if (!state.isEditing || !cmView) return null;
    const selection = cmView.state.selection.main;
    if (selection.empty) return null;
    return {
        from: selection.from,
        to: selection.to,
        isAllSelected: selection.from === 0 && selection.to === cmView.state.doc.length,
    };
}

function findContextBoundary(text, start, end, direction) {
    const segment = text.slice(start, end);
    const paragraphBreak = direction === 'backward'
        ? segment.lastIndexOf('\n\n')
        : segment.indexOf('\n\n');
    if (paragraphBreak === -1) {
        return direction === 'backward' ? start : end;
    }
    return direction === 'backward'
        ? start + paragraphBreak + 2
        : start + paragraphBreak;
}

function buildSelectionContext(docText, from, to) {
    const rawBeforeStart = Math.max(0, from - AI_EDIT_CONTEXT_LIMIT);
    const rawAfterEnd = Math.min(docText.length, to + AI_EDIT_CONTEXT_LIMIT);

    const beforeStart = findContextBoundary(docText, rawBeforeStart, from, 'backward');
    const afterEnd = findContextBoundary(docText, to, rawAfterEnd, 'forward');

    const beforeContext = docText.slice(beforeStart, from).trimStart();
    const selectedText = docText.slice(from, to);
    const afterContext = docText.slice(to, afterEnd).trimEnd();

    return {
        selectedText,
        beforeContext,
        afterContext,
    };
}

function buildPromptSection(tagName, content) {
    return [
        `<${tagName}>`,
        content || '(empty)',
        `</${tagName}>`,
    ];
}

function buildMarkdownSection(title, lines) {
    if (!lines?.length) return [];
    return [
        `## ${title}`,
        ...lines.map(line => `- ${line}`),
    ];
}

function buildRawMarkdownSection(title, content) {
    const body = String(content || '').trim();
    if (!body) return [];
    return [
        `## ${title}`,
        body,
    ];
}

function buildTaggedDataSection(title, tagName, content) {
    return [
        `## ${title}`,
        ...buildPromptSection(tagName, content),
    ];
}

function buildInstructionSection(userPrompt) {
    return [
        '## Instruction',
        `<instruction>${userPrompt}</instruction>`,
    ];
}

function shouldIncludeFullGfmReference(userPrompt) {
    const prompt = String(userPrompt || '').toLowerCase();
    return /\b(gfm|github flavored markdown|github-compatible|markdown|readme|table|code block|blockquote|alert|mermaid|html|div|image|checklist|task list|heading)\b/.test(prompt) ||
        /(깃허브|마크다운|표|테이블|코드블록|코드 블록|인용|알림|이미지|체크리스트|작업 목록|제목|서식|형식|정렬|가운데|중앙|호환)/.test(prompt);
}

function isLikelySelectedTextTransformPrompt(userPrompt) {
    const prompt = String(userPrompt || '').trim().toLowerCase();
    return /\b(translate|rewrite|summarize|shorten|expand|polish|proofread|correct|fix grammar|change tone|convert|format)\b/.test(prompt) ||
        /(번역|한국어|영어|일본어|중국어|요약|줄여|늘려|다듬|교정|수정|고쳐|바꿔|변환|정리|문체|톤|존댓말|반말)/.test(prompt);
}

function isLikelyInsertionPrompt(userPrompt) {
    const prompt = String(userPrompt || '').trim().toLowerCase();
    return /\b(write|create|generate|insert|draft|compose|make|add|table|list|markdown|readme|heading|checklist|code block)\b/.test(prompt) ||
        /(입력|작성|써|써줘|만들|생성|추가|삽입|표|테이블|목록|리스트|마크다운|제목|체크리스트|코드블록|문서|글|초안)/.test(prompt);
}

function getGithubCompatiblePromptSections({ userPrompt } = {}) {
    if (!state.aiGithubCompatibleEnabled) return [];

    const sections = [
        buildMarkdownSection('GitHub Compatible Mode', [
            'GitHub-compatible mode is only a formatting constraint. The user instruction remains the primary task.',
            'For translation, correction, summarization, rewriting, or other content tasks, do the requested task normally and preserve the existing Markdown structure unless the user asks to change the format.',
            'Use GFM-compatible syntax when generating or modifying Markdown markup.',
            'Prefer Markdown first; use simple GitHub-safe HTML only when Markdown cannot express the result clearly.',
            'Do not use font tags, inline CSS layout, or unsupported Markdown extensions unless the user explicitly asks for them.',
            'When content is wrapped in <div> tags, convert Markdown image syntax (e.g., ![alt](image.png)) into standard HTML <img> tags.',
        ]),
    ];

    if (shouldIncludeFullGfmReference(userPrompt)) {
        sections.push(
            buildMarkdownSection('GFM Reference Priority', [
                'The examples below are a style reference only. Do not imitate their content, topic, language, or structure unless the user asks for that kind of Markdown.',
            ]),
            buildRawMarkdownSection('GFM Examples', gfmReference),
        );
    }

    return sections;
}

function buildAskAIQuestionPrompt(userPrompt) {
    return joinPromptSections(
        buildMarkdownSection('Shared Rules', getSharedRulePromptLines()),
        buildMarkdownSection('Rules', ASK_AI_PROMPT_LINES),
        ...getGithubCompatiblePromptSections({ userPrompt }),
        buildInstructionSection(userPrompt),
    );
}

function getSharedRulePromptLines() {
    return AI_SHARED_RULE_PROMPT_LINES.length
        ? [
            'Apply these shared formatting rules to every edit.',
            ...AI_SHARED_RULE_PROMPT_LINES,
        ]
        : [];
}

function getIntentAwareInstructionLines({ includeContext, userPrompt }) {
    return [
        ...(isLikelySelectedTextTransformPrompt(userPrompt) ? [
            'The user instruction is a selected-text transformation request. Treat it as <intent>edit</intent>.',
            'Transform <selected_text> directly and put the transformed text in <replacement>.',
            'Do not answer that you will transform the text; perform the transformation.',
        ] : []),
        AI_EDIT_RULES.selectedTextOnly,
        ...(includeContext ? [AI_CONTEXT_RULES.referenceOnlyReplacement] : []),
        ...getSharedRulePromptLines(),
        ...SUPPORT_AGENT_PROMPT_LINES,
    ];
}

function joinPromptSections(...sections) {
    return sections
        .filter(section => Array.isArray(section) && section.length > 0)
        .map(section => section.join('\n'))
        .join('\n\n');
}

function buildEditPromptSections({ selectedText, beforeContext, afterContext, instructionLines, includeContext, userPrompt }) {
    const sections = [
        buildMarkdownSection('Rules', instructionLines),
        ...getGithubCompatiblePromptSections({ userPrompt }),
    ];

    if (includeContext) {
        sections.push(buildTaggedDataSection('Before Context', 'before_context', beforeContext));
    }

    sections.push(buildTaggedDataSection('Selected Text', 'selected_text', selectedText));

    if (includeContext) {
        sections.push(buildTaggedDataSection('After Context', 'after_context', afterContext));
    }

    sections.push(buildInstructionSection(userPrompt));

    return sections;
}

function buildAIIntentPrompt(docText, from, to, userPrompt) {
    const includeContext = !!state.aiSelectionContextEnabled;
    const context = includeContext
        ? buildSelectionContext(docText, from, to)
        : { selectedText: docText.slice(from, to) };

    return {
        prompt: joinPromptSections(...buildEditPromptSections({
            ...context,
            instructionLines: getIntentAwareInstructionLines({ includeContext, userPrompt }),
            includeContext,
            userPrompt,
        })),
    };
}

function getAIEditSystemPrompt() {
    const baseIdentity = 'You are an AI Markdown editor assistant.';
    const contextInstruction = state.aiSelectionContextEnabled
        ? 'Edit only <selected_text>. <before_context> and <after_context> are reference only.'
        : 'Edit only <selected_text>.';
    const capabilityLines = [
        baseIdentity,
        ...(state.aiGithubCompatibleEnabled ? [
            'GitHub-compatible mode is enabled. Follow the GFM examples provided with the user request.',
            'Prefer Markdown first, and use simple GitHub-safe HTML only when Markdown cannot express the result clearly.',
        ] : []),
        contextInstruction,
        'Internally reason about whether the user wants a document edit or a general answer, but do not reveal the reasoning steps.',
    ];
    const responseLines = [
        'Return exactly three XML blocks in this order: <intent>...</intent><support_report>...</support_report><replacement>...</replacement>.',
        'Use <intent>edit</intent> only when the user clearly wants to modify <selected_text>.',
        'Translation, rewriting, summarization, grammar correction, tone changes, language changes, and format conversion of <selected_text> are edit requests.',
        'For short edit commands such as "한국어로 번역", return the translated text inside <replacement>; do not merely describe what you would do.',
        'Use <intent>question</intent> or <intent>ambiguous</intent> when the user is asking for an explanation, answer, or non-edit help.',
        'If intent is edit, <replacement> must contain only the replacement text for <selected_text>.',
        'If intent is question or ambiguous, leave <replacement></replacement> empty and answer briefly in <support_report>.',
    ];

    return joinPromptSections(
        buildMarkdownSection('Role', capabilityLines),
        buildMarkdownSection('Shared Rules', AI_SHARED_RULE_PROMPT_LINES),
        buildMarkdownSection('Response Format', responseLines),
    );
}

function getAIQuestionSystemPrompt() {
    return joinPromptSections(
        buildMarkdownSection('Role', [
            'You are an AI assistant for a Markdown editor.',
            'When no text is selected, insert newly requested document content at the cursor and answer simple informational questions in the support report.',
            'Internally reason about whether the request is a document insertion, a clear question, or ambiguous, but do not reveal the reasoning steps.',
        ]),
        buildMarkdownSection('Shared Rules', AI_SHARED_RULE_PROMPT_LINES),
        buildMarkdownSection('Response Format', [
            'Return exactly three XML blocks in this order: <intent>...</intent><support_report>...</support_report><replacement>...</replacement>.',
            'Use <intent>edit</intent> when the user asks you to write, create, generate, insert, draft, compose, or make content for the document.',
            `Use <intent>question</intent> or <intent>ambiguous</intent> for non-edit help, keep <support_report> within ${SUPPORT_REPORT_MAX_CHARS} characters, and keep <replacement></replacement> empty.`,
        ]),
    );
}

function normalizeAIIntent(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === AI_INTENT_VALUES.edit) return AI_INTENT_VALUES.edit;
    if (normalized === AI_INTENT_VALUES.question) return AI_INTENT_VALUES.question;
    if (normalized === AI_INTENT_VALUES.ambiguous) return AI_INTENT_VALUES.ambiguous;
    return '';
}

function extractStructuredAIPayload(rawText) {
    const source = String(rawText || '');
    const intentMatch = source.match(/<intent>([\s\S]*?)<\/intent>/i);
    const reportMatch = source.match(/<support_report>([\s\S]*?)<\/support_report>/i);
    const replacementMatch = source.match(/<replacement>([\s\S]*?)<\/replacement>/i);
    const intent = normalizeAIIntent(intentMatch ? intentMatch[1] : '');
    const report = reportMatch ? reportMatch[1].trim() : '';
    let replacement = replacementMatch ? replacementMatch[1] : '';

    if (!replacementMatch || !replacement.trim()) {
        replacement = extractFallbackAIReplacement(source);
    }

    replacement = replacement.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');

    return {
        intent,
        report: normalizeSupportReport(report),
        replacement,
    };
}

function extractFallbackAIReplacement(source) {
    return String(source || '')
        .replace(/<intent>[\s\S]*?<\/intent>/gi, '')
        .replace(/<support_report>[\s\S]*?<\/support_report>/gi, '')
        .replace(/<replacement>[\s\S]*?<\/replacement>/gi, '')
        .replace(/<\/?(?:markdown|table)>/gi, '')
        .trim();
}

function containsSupportReportTag(rawText) {
    return /<support_report>[\s\S]*?<\/support_report>/i.test(String(rawText || ''));
}

function containsIntentTag(rawText) {
    return /<intent>[\s\S]*?<\/intent>/i.test(String(rawText || ''));
}

function showAIDock() {
    clearTimeout(aiDockHideTimer);
    el.editorAiDock.classList.remove('hidden', 'is-hiding');
    requestAnimationFrame(() => {
        el.editorAiDock.classList.add('is-visible');
    });
}

function hideAIDock({ immediate = false } = {}) {
    if (el.editorAiDock.classList.contains('hidden')) return;
    clearTimeout(aiDockHideTimer);
    if (immediate) {
        el.editorAiDock.classList.remove('is-visible', 'is-hiding');
        el.editorAiDock.classList.add('hidden');
        return;
    }
    el.editorAiDock.classList.remove('is-visible');
    el.editorAiDock.classList.add('is-hiding');
    aiDockHideTimer = setTimeout(() => {
        el.editorAiDock.classList.remove('is-hiding');
        el.editorAiDock.classList.add('hidden');
    }, AI_DOCK_FADE_MS);
}

function showAIPanel() {
    clearTimeout(aiPanelHideTimer);
    el.editorAiPanel.classList.remove('hidden', 'is-hiding');
    requestAnimationFrame(() => {
        el.editorAiPanel.classList.add('is-visible');
    });
}

function hideAIPanel({ immediate = false } = {}) {
    if (el.editorAiPanel.classList.contains('hidden')) return;
    clearTimeout(aiPanelHideTimer);
    if (immediate) {
        el.editorAiPanel.classList.remove('is-visible', 'is-hiding');
        el.editorAiPanel.classList.add('hidden');
        return;
    }
    el.editorAiPanel.classList.remove('is-visible');
    el.editorAiPanel.classList.add('is-hiding');
    aiPanelHideTimer = setTimeout(() => {
        el.editorAiPanel.classList.remove('is-hiding');
        el.editorAiPanel.classList.add('hidden');
    }, AI_DOCK_FADE_MS);
}

function updatePromptInputLayout() {
    if (!el.aiPromptInput || !el.aiPromptBox) return;
    if (aiPromptBusyState && !isPromptBoxVisible()) {
        el.aiPromptInput.style.height = '';
        el.aiPromptInput.style.overflowY = 'hidden';
        return;
    }
    const maxLines = isSupportAgentPromptVisible() ? AI_SUPPORT_REPORT_MAX_LINES : AI_PROMPT_INPUT_MAX_LINES;
    const content = el.aiPromptInput.value || "";
    const longestLineLength = content
        .split('\n')
        .reduce((maxLength, line) => Math.max(maxLength, line.length), 0);
    const calculatedWidth = AI_PROMPT_BASE_WIDTH + Math.max(0, longestLineLength - 18) * 7;
    const nextWidth = Math.max(AI_PROMPT_BASE_WIDTH, Math.min(AI_PROMPT_MAX_WIDTH, calculatedWidth));
    el.aiPromptBox.style.setProperty('--ai-prompt-width', `${nextWidth}px`);

    el.aiPromptInput.style.height = 'auto';
    const computedStyle = window.getComputedStyle(el.aiPromptInput);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const verticalInsets = parseFloat(computedStyle.paddingTop || '0') + parseFloat(computedStyle.paddingBottom || '0');
    const maxHeight = lineHeight * maxLines + verticalInsets;
    const nextHeight = Math.min(el.aiPromptInput.scrollHeight, maxHeight);
    el.aiPromptInput.style.height = `${Math.max(lineHeight + verticalInsets, nextHeight)}px`;
    el.aiPromptInput.style.overflowY = el.aiPromptInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function isEditorPromptAvailable() {
    return state.isEditing
        && !!cmView
        && el.mainContainer?.classList.contains('is-editing')
        && !el.editorView?.classList.contains('hidden');
}

function showPromptBoxElement() {
    if (!isEditorPromptAvailable()) {
        hidePromptBoxElement({ immediate: true });
        return false;
    }
    clearTimeout(aiPromptHideTimer);
    updatePromptInputLayout();
    el.aiPromptBox.classList.remove('hidden', 'is-leaving');
    requestAnimationFrame(() => {
        if (!isEditorPromptAvailable() || el.aiPromptBox.classList.contains('hidden')) return;
        el.aiPromptBox.classList.add('is-visible');
    });
    return true;
}

function hidePromptBoxElement({ immediate = false } = {}) {
    clearTimeout(aiPromptHideTimer);
    if (immediate) {
        el.aiPromptBox.classList.remove('is-visible', 'is-leaving');
        el.aiPromptBox.classList.add('hidden');
        return;
    }
    if (el.aiPromptBox.classList.contains('hidden')) return;
    el.aiPromptBox.classList.remove('is-visible');
    el.aiPromptBox.classList.add('is-leaving');
    aiPromptHideTimer = setTimeout(() => {
        el.aiPromptBox.classList.remove('is-leaving');
        el.aiPromptBox.classList.add('hidden');
    }, 180);
}

function isPromptBoxVisible() {
    return !el.aiPromptBox.classList.contains('hidden');
}

function positionPromptBox() {
    el.aiPromptBox.style.left = '50%';
    el.aiPromptBox.style.bottom = '132px';
    el.aiPromptBox.style.top = 'auto';
}

function showPromptBox({ focusInput = false, preserveInput = true, allowEmptySelection = false } = {}) {
    if (!isEditorPromptAvailable()) {
        hidePromptBox({ restoreEditorFocus: false, immediate: true });
        return false;
    }
    if (!isGeneralAIActive()) return false;
    if (isSpellcheckActive() && !isAIProgressVisible()) {
        hidePromptBox({ restoreEditorFocus: false });
        return false;
    }
    if (!allowEmptySelection && !getEditorSelection()) return false;

    aiPromptForcedVisible = allowEmptySelection;
    positionPromptBox();
    if (focusInput) {
        clearSupportAgentPrompt();
    }
    if (!preserveInput) {
        el.aiPromptInput.value = "";
        lastPromptInputValue = "";
    }
    showPromptBoxElement();
    updatePromptPlaceholder();
    if (focusInput) {
        requestAnimationFrame(() => {
            if (!isEditorPromptAvailable() || el.aiPromptBox.classList.contains('hidden')) return;
            el.aiPromptInput.focus();
            updatePromptPlaceholder();
            if (el.aiPromptInput.value) {
                el.aiPromptInput.select();
            }
        });
    }
    return true;
}

function refreshPromptForSelection({ focusInput = false, preserveInput = true } = {}) {
    if (isSpellcheckActive() && !isAIProgressVisible()) {
        hidePromptBox({ restoreEditorFocus: false });
        return false;
    }
    if (!state.isEditing || !cmView || !isGeneralAIActive() || cmView.composing) {
        hidePromptBoxElement();
        return false;
    }
    if (!getEditorSelection()) {
        if (!aiPromptForcedVisible) {
            hidePromptBoxElement();
            return false;
        }
        return showPromptBox({ focusInput, preserveInput, allowEmptySelection: true });
    }
    return showPromptBox({ focusInput, preserveInput, allowEmptySelection: aiPromptForcedVisible });
}

async function persistAISettings() {
    await persistAppSettings();
}

function syncSettingsTabs(activeTab = 'appearance') {
    const normalizedTab = activeTab === 'common' ? 'appearance' : activeTab;
    const isCommon = normalizedTab === 'appearance';
    const isReading = normalizedTab === 'reading';
    const isEditor = normalizedTab === 'editor';
    const isAi = normalizedTab === 'ai';
    lastSettingsTab = normalizedTab;
    el.settingsTabCommon?.classList.toggle('active', isCommon);
    el.settingsTabReading?.classList.toggle('active', isReading);
    el.settingsTabEditor?.classList.toggle('active', isEditor);
    el.settingsTabAi?.classList.toggle('active', isAi);
    el.settingsTabCommon?.setAttribute('aria-selected', String(isCommon));
    el.settingsTabReading?.setAttribute('aria-selected', String(isReading));
    el.settingsTabEditor?.setAttribute('aria-selected', String(isEditor));
    el.settingsTabAi?.setAttribute('aria-selected', String(isAi));
    el.settingsTabCommon?.setAttribute('tabindex', isCommon ? '0' : '-1');
    el.settingsTabReading?.setAttribute('tabindex', isReading ? '0' : '-1');
    el.settingsTabEditor?.setAttribute('tabindex', isEditor ? '0' : '-1');
    el.settingsTabAi?.setAttribute('tabindex', isAi ? '0' : '-1');
    el.settingsPanelCommon?.classList.toggle('hidden', !isCommon);
    el.settingsPanelReading?.classList.toggle('hidden', !isReading);
    el.settingsPanelEditor?.classList.toggle('hidden', !isEditor);
    el.settingsPanelAi?.classList.toggle('hidden', !isAi);
    if (el.settingsContentScroll) {
        el.settingsContentScroll.scrollTop = 0;
    }
    if (isReading) {
        void populateSystemFonts();
    }
}

function getSettingsFormSignature() {
    if (!el.aiSettingsModal) return "";
    const values = Array.from(el.aiSettingsModal.querySelectorAll('input, select')).map(control => ({
        id: control.id || control.dataset.tokenColorKey || control.name || control.type,
        value: control.type === 'checkbox' ? control.checked : control.value,
    }));
    return JSON.stringify(values);
}

function setSettingsDirtyState(isDirty) {
    if (el.aiSettingsSave) {
        el.aiSettingsSave.disabled = !isDirty;
    }
    if (el.settingsDirtyStatus) {
        el.settingsDirtyStatus.textContent = isDirty ? 'Unsaved changes' : 'No unsaved changes';
        el.settingsDirtyStatus.classList.toggle('is-dirty', isDirty);
    }
}

function captureSettingsBaseline() {
    settingsFormBaseline = getSettingsFormSignature();
    setSettingsDirtyState(false);
}

function updateSettingsDirtyState() {
    if (el.aiSettingsModal?.classList.contains('hidden')) return;
    setSettingsDirtyState(getSettingsFormSignature() !== settingsFormBaseline);
}

function syncSegmentedControl(container, dataAttribute, value) {
    container?.querySelectorAll(`button[${dataAttribute}]`).forEach(button => {
        const isActive = button.getAttribute(dataAttribute) === value;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function syncSettingsSwitchLabels() {
    el.aiSettingsModal?.querySelectorAll('.settings-switch').forEach(control => {
        const input = control.querySelector('input[type="checkbox"]');
        const label = control.querySelector('.settings-switch-label');
        if (input && label) {
            label.textContent = input.checked ? 'On' : 'Off';
        }
    });
}

function resetSettingsPasswordVisibility() {
    el.aiSettingsModal?.querySelectorAll('[data-password-target]').forEach(button => {
        const input = document.getElementById(button.dataset.passwordTarget);
        if (input) input.type = 'password';
        button.setAttribute('aria-label', 'Show API key');
        const icon = button.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = 'preview';
    });
}

function syncSettingsProxyControls() {
    syncSegmentedControl(el.settingsMarginSegmented, 'data-margin-value', el.settingsDocumentMargin?.value || 'none');
    syncSegmentedControl(el.editorToolbarSegmented, 'data-toolbar-value', el.editorToolbarMode?.value || 'beginner');
    if (el.aiFeaturesEnabled && el.aiFeaturesDisabled) {
        el.aiFeaturesEnabled.checked = !el.aiFeaturesDisabled.checked;
    }
    syncSettingsSwitchLabels();
}

function syncAccentColorValues() {
    const lightValue = document.getElementById('light-accent-value');
    const darkValue = document.getElementById('dark-accent-value');
    if (lightValue) lightValue.textContent = normalizeAccentColor(state.lightAccentColor).toUpperCase();
    if (darkValue) darkValue.textContent = normalizeAccentColor(state.darkAccentColor, DEFAULT_DARK_ACCENT_COLOR).toUpperCase();
}

function syncEditorSettingsPreview() {
    const preview = el.aiSettingsModal?.querySelector('.settings-editor-preview');
    if (!preview) return;
    const colors = {};
    el.editorTokenColorGrid?.querySelectorAll('input[type="color"]').forEach(input => {
        colors[input.dataset.tokenColorKey] = input.value;
    });
    preview.style.setProperty('--editor-background-color', el.editorBackgroundColor?.value || getEditorDefaultBackgroundColor());
    preview.style.setProperty('--editor-text-color', colors.plain || '#24292f');
    preview.style.setProperty('--editor-heading-color', colors.heading || colors.plain || '#8250df');
    preview.style.setProperty('--editor-strong-color', colors.emphasis || '#cf222e');
    preview.style.setProperty('--editor-link-color', colors.link || state.lightAccentColor);
    preview.style.setProperty('--editor-marker-color', colors.marker || state.lightAccentColor);
}

function renderAccentPresetControls() {
    renderAccentPresetList(el.lightAccentPresetList, LIGHT_ACCENT_PRESETS, state.lightAccentColor, 'light');
    renderAccentPresetList(el.darkAccentPresetList, DARK_ACCENT_PRESETS, state.darkAccentColor, 'dark');
    if (el.lightAccentCustom) {
        el.lightAccentCustom.value = normalizeAccentColor(state.lightAccentColor);
    }
    if (el.darkAccentCustom) {
        el.darkAccentCustom.value = normalizeAccentColor(state.darkAccentColor, DEFAULT_DARK_ACCENT_COLOR);
    }
    syncAccentColorValues();
}

function renderAccentPresetList(container, presets, selectedColor, mode) {
    if (!container) return;
    const normalizedSelected = normalizeAccentColor(selectedColor);
    container.innerHTML = presets.map(color => {
        const normalized = normalizeAccentColor(color);
        const active = normalized === normalizedSelected ? ' active' : '';
        return `
            <button type="button" class="accent-preset-btn${active}" data-accent-mode="${mode}" data-accent-color="${normalized}" aria-label="${mode} highlight ${normalized}">
                <span style="background-color: ${normalized}"></span>
            </button>
        `;
    }).join('');
}

function setAccentColor(mode, color) {
    const previousColor = mode === 'dark' ? state.darkAccentColor : state.lightAccentColor;
    const nextColor = normalizeAccentColor(color, mode === 'dark' ? DEFAULT_DARK_ACCENT_COLOR : DEFAULT_LIGHT_ACCENT_COLOR);
    if (mode === 'dark') {
        state.darkAccentColor = nextColor;
    } else {
        state.lightAccentColor = nextColor;
        if (state.editorTokenColors?.link === previousColor) {
            state.editorTokenColors.link = nextColor;
        }
        if (state.editorTokenColors?.marker === previousColor) {
            state.editorTokenColors.marker = nextColor;
        }
        el.editorTokenColorGrid?.querySelectorAll('input[type="color"]').forEach(input => {
            if ((input.dataset.tokenColorKey === 'link' || input.dataset.tokenColorKey === 'marker') && input.value === previousColor) {
                input.value = nextColor;
            }
        });
    }
    applyAccentColors(state.lightAccentColor, state.darkAccentColor);
    applyEditorTokenColors();
    renderAccentPresetControls();
    syncEditorSettingsPreview();
    updateSettingsDirtyState();
}

function syncCommonSettingsControls() {
    renderAccentPresetControls();
    syncMainToolbarSettingsControls();
    if (el.settingsDocumentMargin) {
        el.settingsDocumentMargin.value = state.documentMargin || "none";
    }
    if (el.settingsViewerFont) {
        ensureCurrentViewerFontOption();
        el.settingsViewerFont.value = state.viewerFontFamily || "";
    }
    syncSettingsProxyControls();
}

function ensureCurrentViewerFontOption() {
    const currentFamily = state.viewerFontFamily || "";
    if (!el.settingsViewerFont || !currentFamily || systemFontsLoaded) return;
    const hasCurrentFamily = Array.from(el.settingsViewerFont.options)
        .some(option => option.value === currentFamily);
    if (!hasCurrentFamily) {
        el.settingsViewerFont.add(new Option(currentFamily, currentFamily));
    }
}

function renderEditorTokenColorControls() {
    if (!el.editorTokenColorGrid) return;
    if (el.editorTokenPresetList) {
        el.editorTokenPresetList.innerHTML = EDITOR_TOKEN_COLOR_PRESETS.map(({ key, label }) => `
            <button type="button" class="editor-token-preset-btn" data-token-preset-key="${key}">${label}</button>
        `).join('');
    }
    el.editorTokenColorGrid.innerHTML = EDITOR_TOKEN_COLOR_FIELDS.map(({ key, label }) => {
        const value = state.editorTokenColors[key] || getEditorDefaultTokenColors()[key];
        return `
            <label class="editor-token-color-field">
                <span>${label}</span>
                <input type="color" data-token-color-key="${key}" value="${value}" />
            </label>
        `;
    }).join('');
}

function syncEditorSettingsControls() {
    if (el.editorPreviewScrollSync) {
        el.editorPreviewScrollSync.checked = state.editorPreviewScrollSyncEnabled;
    }
    if (el.editorOrderedListStyle) {
        el.editorOrderedListStyle.value = state.editorOrderedListStyle || 'standard';
    }
    if (el.editorToolbarMode) {
        el.editorToolbarMode.value = state.editorToolbarMode || 'beginner';
    }
    if (el.editorTokenColorsEnabled) {
        el.editorTokenColorsEnabled.checked = state.editorTokenColorsEnabled;
    }
    if (el.editorBackgroundColor) {
        el.editorBackgroundColor.value = state.editorBackgroundColor || getEditorDefaultBackgroundColor();
    }
    renderEditorTokenColorControls();
    syncEditorTokenColorAvailability();
    syncSettingsProxyControls();
    syncEditorSettingsPreview();
}

function syncEditorTokenColorAvailability() {
    const enabled = el.editorTokenColorsEnabled?.checked ?? true;
    el.editorTokenColorGrid?.classList.toggle('is-locked', !enabled);
    el.editorTokenColorGrid?.querySelectorAll('input[type="color"]').forEach(input => {
        input.disabled = !enabled;
    });
    el.editorTokenPresetList?.querySelectorAll('button').forEach(button => {
        button.disabled = !enabled;
    });
    if (el.editorBackgroundColor) {
        el.editorBackgroundColor.disabled = !enabled;
    }
    document.getElementById('editor-token-advanced')?.classList.toggle('is-locked', !enabled);
}

function applyEditorTokenColorPreset(presetKey) {
    const preset = EDITOR_TOKEN_COLOR_PRESETS.find(item => item.key === presetKey);
    if (!preset) return;
    const presetColors = preset.colors || getEditorDefaultTokenColors();
    const presetBackground = preset.background || getEditorDefaultBackgroundColor();
    el.editorTokenColorGrid?.querySelectorAll('input[type="color"]').forEach(input => {
        const key = input.dataset.tokenColorKey;
        input.value = presetColors[key] || input.value;
    });
    if (el.editorBackgroundColor) {
        el.editorBackgroundColor.value = presetBackground;
    }
    syncEditorSettingsPreview();
    updateSettingsDirtyState();
}

function collectEditorSettingsFromControls() {
    state.editorPreviewScrollSyncEnabled = el.editorPreviewScrollSync?.checked ?? true;
    state.editorOrderedListStyle = el.editorOrderedListStyle?.value === 'incremental' ? 'incremental' : 'standard';
    state.editorToolbarMode = ['beginner', 'rookie', 'pro'].includes(el.editorToolbarMode?.value)
        ? el.editorToolbarMode.value
        : 'beginner';
    state.editorTokenColorsEnabled = el.editorTokenColorsEnabled?.checked ?? true;
    const nextColors = {};
    el.editorTokenColorGrid?.querySelectorAll('input[type="color"]').forEach(input => {
        nextColors[input.dataset.tokenColorKey] = input.value;
    });
    state.editorTokenColors = nextColors;
    state.editorBackgroundColor = el.editorBackgroundColor?.value || getEditorDefaultBackgroundColor();
    applyEditorToolbarMode();
    applyEditorTokenColors();
    applyEditorBackgroundColor();
}

async function populateSystemFonts() {
    if (!el.settingsViewerFont || systemFontsLoaded) return;
    if (systemFontsPromise) return systemFontsPromise;

    ensureCurrentViewerFontOption();
    const selectedFamily = state.viewerFontFamily || "";
    el.settingsViewerFont.setAttribute('aria-busy', 'true');

    systemFontsPromise = (async () => {
        try {
            const fonts = await GetSystemFonts();
            const defaultOption = el.settingsViewerFont.querySelector('option[value=""]');
            el.settingsViewerFont.innerHTML = '';
            if (defaultOption) {
                el.settingsViewerFont.appendChild(defaultOption);
            } else {
                const opt = document.createElement('option');
                opt.value = '';
                opt.id = 'settings-option-font-default';
                opt.textContent = 'Default';
                el.settingsViewerFont.appendChild(opt);
            }

            if (fonts && fonts.length > 0) {
                const fragment = document.createDocumentFragment();
                fonts.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.family;
                    opt.textContent = f.family;
                    fragment.appendChild(opt);
                });
                el.settingsViewerFont.appendChild(fragment);
            }
            systemFontsLoaded = true;
            el.settingsViewerFont.value = selectedFamily;
        } catch (err) {
            systemFontsPromise = null;
            console.error('Failed to get system fonts:', err);
        } finally {
            el.settingsViewerFont.removeAttribute('aria-busy');
        }
    })();

    return systemFontsPromise;
}

function applyLayoutSettingsLocalization() {
    const optFontDefault = document.getElementById('settings-option-font-default');
    if (optFontDefault) optFontDefault.textContent = 'System default';
}

export async function initAI() {
    applyAIPromptMotionConfig();
    const s = await GetSettings();
    state.aiFeaturesDisabled = s.aiFeaturesDisabled || false;
    const aiState = {
        generalAvailable: s.aiGeneralEnabled !== false,
        generalToolbarEnabled: s.aiGeneralToolbarEnabled !== false,
        generalProvider: s.aiGeneralProvider || "openai",
        generalEndpoint: s.aiGeneralEndpoint || "",
        generalModel: s.aiGeneralModel || "gemma-4-e4b-it",
        generalKey: s.aiGeneralKey || "",
        generalTemp: clampTemperature(s.aiGeneralTemp || 0),
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
    el.aiFeaturesDisabled.checked = state.aiFeaturesDisabled;
    if (el.aiFeaturesEnabled) {
        el.aiFeaturesEnabled.checked = !state.aiFeaturesDisabled;
    }
    el.aiGeneralProvider.value = aiState.generalProvider;
    el.aiGeneralEndpoint.value = aiState.generalEndpoint;
    el.aiGeneralModel.value = aiState.generalModel;
    el.aiGeneralKey.value = aiState.generalKey;
    el.aiGeneralTemp.value = String(aiState.generalTemp);
    el.aiFimEndpoint.value = aiState.fimEndpoint;
    el.aiFimModel.value = aiState.fimModel;
    el.aiFimKey.value = aiState.fimKey;
    el.aiFimTemp.value = aiState.fimTemp;
    state.aiSelectionContextEnabled = s.aiSelectionContext || false;
    state.aiGithubCompatibleEnabled = s.aiGithubCompatible || false;
    state.aiSupportAgentEnabled = s.aiSupportAgent || false;
    state.aiToolbarCollapsed = s.aiToolbarCollapsed === true;
    el.aiToggleImeFix.checked = s.koreanImeEnterFix || false;
    state.koreanImeFixEnabled = el.aiToggleImeFix.checked;
    aiState.fimEnabled = s.aiFimToolbarEnabled === true;
    state.documentMargin = s.documentMargin || "none";
    if (el.settingsDocumentMargin) {
        el.settingsDocumentMargin.value = state.documentMargin;
    }
    state.viewerFontFamily = s.viewerFontFamily || "";
    ensureCurrentViewerFontOption();
    if (el.settingsViewerFont) {
        el.settingsViewerFont.value = state.viewerFontFamily;
    }
    applyLayoutSettingsLocalization();
    window.aiState = aiState;
    syncAISettingsSections();
    syncAIControls();
    syncGeneralTemperatureControl();
    syncGeneralModelControl();
    updateGeneralModelTrigger();

    return aiState;
}

export function bindAIEvents() {
    el.settingsTabCommon?.addEventListener('click', () => syncSettingsTabs('appearance'));
    el.settingsTabReading?.addEventListener('click', () => syncSettingsTabs('reading'));
    el.settingsTabEditor?.addEventListener('click', () => syncSettingsTabs('editor'));
    el.settingsTabAi?.addEventListener('click', () => syncSettingsTabs('ai'));
    const settingsTabs = [
        { element: el.settingsTabCommon, name: 'appearance' },
        { element: el.settingsTabReading, name: 'reading' },
        { element: el.settingsTabEditor, name: 'editor' },
        { element: el.settingsTabAi, name: 'ai' },
    ].filter(item => item.element);
    settingsTabs.forEach((item, index) => {
        item.element.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
            const nextIndex = event.key === 'Home'
                ? 0
                : event.key === 'End'
                    ? settingsTabs.length - 1
                    : (index + direction + settingsTabs.length) % settingsTabs.length;
            const nextItem = settingsTabs[nextIndex];
            syncSettingsTabs(nextItem.name);
            nextItem.element.focus();
        });
    });
    el.settingsMarginSegmented?.addEventListener('click', event => {
        const button = event.target.closest('[data-margin-value]');
        if (!button || !el.settingsDocumentMargin) return;
        el.settingsDocumentMargin.value = button.dataset.marginValue;
        syncSegmentedControl(el.settingsMarginSegmented, 'data-margin-value', button.dataset.marginValue);
        el.settingsDocumentMargin.dispatchEvent(new Event('change', { bubbles: true }));
    });
    el.editorToolbarSegmented?.addEventListener('click', event => {
        const button = event.target.closest('[data-toolbar-value]');
        if (!button || !el.editorToolbarMode) return;
        el.editorToolbarMode.value = button.dataset.toolbarValue;
        syncSegmentedControl(el.editorToolbarSegmented, 'data-toolbar-value', button.dataset.toolbarValue);
        el.editorToolbarMode.dispatchEvent(new Event('change', { bubbles: true }));
    });
    el.lightAccentPresetList?.addEventListener('click', event => {
        const button = event.target.closest('[data-accent-color]');
        if (!button) return;
        setAccentColor(button.dataset.accentMode, button.dataset.accentColor);
    });
    el.darkAccentPresetList?.addEventListener('click', event => {
        const button = event.target.closest('[data-accent-color]');
        if (!button) return;
        setAccentColor(button.dataset.accentMode, button.dataset.accentColor);
    });
    el.lightAccentCustom?.addEventListener('input', event => setAccentColor('light', event.target.value));
    el.darkAccentCustom?.addEventListener('input', event => setAccentColor('dark', event.target.value));
    el.editorTokenColorsEnabled?.addEventListener('change', () => {
        syncEditorTokenColorAvailability();
        syncSettingsSwitchLabels();
    });
    el.editorTokenPresetList?.addEventListener('click', event => {
        const button = event.target.closest('[data-token-preset-key]');
        if (!button || button.disabled) return;
        applyEditorTokenColorPreset(button.dataset.tokenPresetKey);
    });
    el.aiFeaturesDisabled.addEventListener('change', syncAISettingsSections);
    el.aiFeaturesEnabled?.addEventListener('change', () => {
        el.aiFeaturesDisabled.checked = !el.aiFeaturesEnabled.checked;
        el.aiFeaturesDisabled.dispatchEvent(new Event('change', { bubbles: true }));
        syncSettingsSwitchLabels();
    });
    el.aiSettingsModal?.addEventListener('input', event => {
        if (event.target.matches('#editor-background-color, [data-token-color-key]')) {
            syncEditorSettingsPreview();
        }
        if (event.target.matches('input[type="checkbox"]')) {
            syncSettingsSwitchLabels();
        }
        updateSettingsDirtyState();
    });
    el.aiSettingsModal?.addEventListener('change', event => {
        if (event.target.matches('#editor-background-color, [data-token-color-key]')) {
            syncEditorSettingsPreview();
        }
        syncSettingsProxyControls();
        updateSettingsDirtyState();
    });
    el.aiSettingsModal?.addEventListener('click', event => {
        const passwordToggle = event.target.closest('[data-password-target]');
        if (!passwordToggle) return;
        const input = document.getElementById(passwordToggle.dataset.passwordTarget);
        if (!input) return;
        const showValue = input.type === 'password';
        input.type = showValue ? 'text' : 'password';
        passwordToggle.setAttribute('aria-label', showValue ? 'Hide API key' : 'Show API key');
        const icon = passwordToggle.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = showValue ? 'preview_off' : 'preview';
    });
    el.aiGeneralProvider.addEventListener('change', handleGeneralProviderChange);
    el.aiGeneralEndpoint.addEventListener('change', handleGeneralEndpointChange);
    el.aiGeneralEndpoint.addEventListener('blur', handleGeneralEndpointChange);
    el.aiGeneralKey.addEventListener('change', handleGeneralEndpointChange);
    el.aiGeneralKey.addEventListener('blur', handleGeneralEndpointChange);
    el.aiGeneralModelTrigger.addEventListener('click', handleGeneralModelTriggerClick);
    el.aiGeneralModelList.addEventListener('click', handleGeneralModelListClick);
    el.edGeneralTempSlider.addEventListener('input', event => {
        void setGeneralTemperature(event.target.value, { persist: false });
    });
    el.edGeneralTempSlider.addEventListener('change', event => {
        void setGeneralTemperature(event.target.value);
    });
    el.edGeneralTempValue.addEventListener('click', () => {
        void setGeneralTemperature(0);
    });
    el.edAiToolbarToggle.addEventListener('click', () => {
        if (!isGeneralAIToolbarEnabled()) return;
        state.aiToolbarCollapsed = !state.aiToolbarCollapsed;
        syncAIControls();
        void persistAISettings();
    });
    document.addEventListener('click', handleDocumentClickForModelPopover);
    document.addEventListener('keydown', handleDocumentKeydownForModelPopover);

    // Settings Modal
    el.edSettings.onclick = () => {
        settingsAccentSnapshot = {
            light: state.lightAccentColor,
            dark: state.darkAccentColor,
            editorTokenColors: { ...(state.editorTokenColors || {}) },
            documentMargin: state.documentMargin,
            viewerFontFamily: state.viewerFontFamily,
        };
        syncSettingsTabs(lastSettingsTab);
        syncCommonSettingsControls();
        syncEditorSettingsControls();
        if (el.aiFeaturesDisabled) {
            el.aiFeaturesDisabled.checked = state.aiFeaturesDisabled;
        }
        syncSettingsProxyControls();
        resetSettingsPasswordVisibility();
        syncAISettingsSections();
        syncGeneralModelControl();
        if (el.aiGeneralProvider.value === 'lmstudio') {
            refreshLMStudioModels({ keepOpen: false });
        }
        el.aiSettingsModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            captureSettingsBaseline();
            const activeTab = el.aiSettingsModal.querySelector('.settings-tab.active');
            activeTab?.focus();
        });
    };
    el.aiSettingsCancel.onclick = () => {
        closeGeneralModelPopover();
        resetSettingsPasswordVisibility();
        if (settingsAccentSnapshot) {
            state.lightAccentColor = settingsAccentSnapshot.light;
            state.darkAccentColor = settingsAccentSnapshot.dark;
            state.editorTokenColors = { ...(settingsAccentSnapshot.editorTokenColors || {}) };
            state.documentMargin = settingsAccentSnapshot.documentMargin || "none";
            state.viewerFontFamily = settingsAccentSnapshot.viewerFontFamily || "";
            settingsAccentSnapshot = null;
        }
        applyAccentColors(state.lightAccentColor, state.darkAccentColor);
        applyEditorTokenColors();
        applyDocumentMarginStyle(state.documentMargin);
        applyViewerFontFamily(state.viewerFontFamily);
        if (el.settingsDocumentMargin) {
            el.settingsDocumentMargin.value = state.documentMargin;
        }
        if (el.settingsViewerFont) {
            el.settingsViewerFont.value = state.viewerFontFamily;
        }
        setSettingsDirtyState(false);
        el.aiSettingsModal.classList.add('hidden');
        el.edSettings.focus();
    };
    el.settingsClose?.addEventListener('click', () => el.aiSettingsCancel.click());
    el.aiSettingsModal?.addEventListener('click', event => {
        if (event.target === el.aiSettingsModal) {
            el.aiSettingsCancel.click();
        }
    });
    document.addEventListener('keydown', event => {
        if (el.aiSettingsModal?.classList.contains('hidden')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            if (!el.aiGeneralModelPopover?.classList.contains('hidden')) {
                closeGeneralModelPopover();
                return;
            }
            el.aiSettingsCancel.click();
        } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !el.aiSettingsSave.disabled) {
            event.preventDefault();
            el.aiSettingsSave.click();
        } else if (event.key === 'Tab') {
            const focusable = Array.from(el.aiSettingsModal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), summary'
            )).filter(node => node.offsetParent !== null);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    el.aiSettingsSave.onclick = async () => {
        state.aiFeaturesDisabled = el.aiFeaturesDisabled.checked;
        if (state.aiFeaturesDisabled && aiRequestInFlight) {
            aiRequestQueue = [];
            await cancelActiveAIRequest();
        } else if (state.aiFeaturesDisabled) {
            aiRequestQueue = [];
        }
        window.aiState.generalProvider = el.aiGeneralProvider.value;
        window.aiState.generalEndpoint = el.aiGeneralEndpoint.value;
        window.aiState.generalModel = el.aiGeneralModel.value || "gemma-4-e4b-it";
        window.aiState.generalKey = el.aiGeneralKey.value;
        window.aiState.generalTemp = clampTemperature(el.aiGeneralTemp.value);
        window.aiState.fimEndpoint = el.aiFimEndpoint.value;
        window.aiState.fimModel = el.aiFimModel.value || "qwen2.5-coder-0.5b-instruct-mlx";
        window.aiState.fimKey = el.aiFimKey.value;
        window.aiState.fimTemp = parseFloat(el.aiFimTemp.value) || 0;
        state.koreanImeFixEnabled = el.aiToggleImeFix.checked;
        state.lightAccentColor = normalizeAccentColor(el.lightAccentCustom?.value, state.lightAccentColor);
        state.darkAccentColor = normalizeAccentColor(el.darkAccentCustom?.value, state.darkAccentColor);
        state.documentMargin = el.settingsDocumentMargin?.value || "none";
        state.viewerFontFamily = el.settingsViewerFont?.value || "";
        collectMainToolbarSettingsFromControls();
        applyAccentColors(state.lightAccentColor, state.darkAccentColor);
        applyDocumentMarginStyle(state.documentMargin);
        applyViewerFontFamily(state.viewerFontFamily);
        applyMainToolbarVisibility();
        collectEditorSettingsFromControls();
        await persistAISettings();

        syncAIControls();
        syncGeneralTemperatureControl();

        closeGeneralModelPopover();
        resetSettingsPasswordVisibility();
        settingsAccentSnapshot = null;
        captureSettingsBaseline();
        el.aiSettingsModal.classList.add('hidden');
        el.edSettings.focus();
        showToast("Settings saved.");
    };

    // AI Progress Events from Go
    EventsOn('ai:progress', (data) => {
        if (!aiRequestInFlight) {
            return;
        }
        const isCompleted = data.completed === true;
        const progress = Math.round(data.progress || 0);

        if (!isCompleted) {
            showPromptBusyState({
                label: data.label || "Processing...",
                progress,
            });
        }

        if (isCompleted) {
            hideAIProgressOverlay();
            aiRequestInFlight = false;
        }
    });

    EventsOn('ai:reasoning', () => {
        if (!aiRequestInFlight && !aiPromptBusyState) {
            return;
        }
        setPromptBusyInputText('Thinking...');
    });

    EventsOn('ai:delta', (data) => {
        queueAIDeltaTicker(data?.kind || "message", data?.text || "");
    });

    el.btnProgressCancel?.addEventListener('click', event => {
        if (!aiRequestInFlight && aiRequestQueue.length === 0) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelActiveAIRequest();
    }, true);

    // FIM Toggle
    el.edGeneralAi.onclick = async () => {
        if (!isGeneralAIAvailable()) {
            syncAIControls();
            showToast(isAIFeaturesDisabled() ? "AI features are disabled in Advanced Options." : "General AI is disabled in AI Settings.");
            return;
        }
        window.aiState.generalToolbarEnabled = !window.aiState.generalToolbarEnabled;
        syncAIControls();
        await persistAISettings();
        showToast(window.aiState.generalToolbarEnabled ? "General AI Enabled" : "General AI Disabled");
    };

    el.edFim.onclick = async () => {
        if (!isFIMAvailable()) {
            syncAIControls();
            showToast(isAIFeaturesDisabled() ? "AI features are disabled in Advanced Options." : "FIM is disabled in AI Settings.");
            return;
        }
        window.aiState.fimEnabled = !window.aiState.fimEnabled;
        syncAIControls();
        await persistAISettings();
        showToast(window.aiState.fimEnabled ? "AI FIM Enabled" : "AI FIM Disabled");
    };

    el.edContextPlus.onclick = async () => {
        if (isAIFeaturesDisabled()) return;
        state.aiSelectionContextEnabled = !state.aiSelectionContextEnabled;
        syncAIControls();
        await persistAISettings();
        showToast(state.aiSelectionContextEnabled ? "Context+ Enabled" : "Context+ Disabled");
    };

    el.edGithubCompatible.onclick = async () => {
        if (isAIFeaturesDisabled()) return;
        state.aiGithubCompatibleEnabled = !state.aiGithubCompatibleEnabled;
        syncAIControls();
        await persistAISettings();
        showToast(state.aiGithubCompatibleEnabled ? "GitHub Compatible AI Edits Enabled" : "GitHub Compatible AI Edits Disabled");
    };

    el.edSupportAgent.onclick = async () => {
        if (isAIFeaturesDisabled()) return;
        state.aiSupportAgentEnabled = !state.aiSupportAgentEnabled;
        if (!state.aiSupportAgentEnabled) {
            clearSupportAgentPrompt();
        }
        syncAIControls();
        await persistAISettings();
        showToast(state.aiSupportAgentEnabled ? "Support Agent Enabled" : "Support Agent Disabled");
    };

    el.aiPromptClose.onclick = () => {
        hidePromptBox();
    };
    el.aiPromptSend.onclick = sendPrompt;
    el.aiPromptInput.addEventListener('input', () => {
        if (isSupportAgentPromptVisible()) return;
        lastPromptInputValue = el.aiPromptInput.value;
        updatePromptInputLayout();
    });
    el.aiPromptInput.addEventListener('mousedown', (e) => {
        if (!isSupportAgentPromptVisible()) return;
        e.preventDefault();
        e.stopPropagation();
        clearSupportAgentPrompt({ focusInput: true });
    });
    el.aiPromptInput.addEventListener('focus', () => {
        if (isSupportAgentPromptVisible()) {
            clearSupportAgentPrompt({ focusInput: true });
            return;
        }
        updatePromptPlaceholder();
    });
    el.aiPromptInput.addEventListener('blur', () => {
        updatePromptPlaceholder();
    });
    el.aiPromptInput.addEventListener('keydown', (e) => {
        if (isSupportAgentPromptVisible()) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                hidePromptBox();
            }
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
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

    // Detect selection for prompt and typing for FIM
    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('resize', () => {
        refreshPromptForSelection({ preserveInput: true });
    }, { passive: true });

    el.editorView.addEventListener('keydown', handleEditorKeydown, true);
    el.editorView.addEventListener('input', handleEditorInput, true);
}

function handleEditorInput() {
    if (!isAIProgressVisible() && isPromptBoxVisible()) {
        hidePromptBox({ restoreEditorFocus: false });
    }
    if (!cmView || !isFIMEnabled() || !window.aiState.fimEndpoint) return;
    if (cmView.composing) return;
    if (!cmView.state.selection.main.empty) return;

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
    if (isSpellcheckActive() && !isAIProgressVisible()) {
        hidePromptBox({ restoreEditorFocus: false });
        return;
    }
    if (!state.isEditing || !cmView || !isGeneralAIActive()) {
        hidePromptBox({ restoreEditorFocus: false });
        return;
    }

    if (cmView.composing) {
        hidePromptBox({ restoreEditorFocus: false });
        return;
    }

    const sel = cmView.state.selection.main;
    if (window.aiState.ghostText !== "" && (sel.head !== window.aiState.ghostPos || !sel.empty)) {
        clearGhostText();
    }

    if (sel.empty) {
        if (aiPromptForcedVisible) {
            refreshPromptForSelection({ preserveInput: true });
        } else {
            hidePromptBox({ restoreEditorFocus: false });
        }
        return;
    }
    refreshPromptForSelection({ preserveInput: true });
}

export function showPromptBoxAtSelection() {
    return showPromptBox({ focusInput: true, preserveInput: true });
}

export function showAskAIPrompt() {
    if (!isEditorPromptAvailable()) {
        hidePromptBox({ restoreEditorFocus: false, immediate: true });
        showToast("Ask AI is available in editor mode.");
        return false;
    }
    if (isSpellcheckActive() && !isAIProgressVisible()) {
        hidePromptBox({ restoreEditorFocus: false });
        return false;
    }
    if (!isGeneralAIActive()) {
        showToast(isAIFeaturesDisabled() ? "AI features are disabled in Advanced Options." : "General AI is disabled in AI Settings.");
        return false;
    }
    return showPromptBox({ focusInput: true, preserveInput: true, allowEmptySelection: true });
}

export function hidePromptBox({ clearInput = true, restoreEditorFocus = true, preserveSupport = false, immediate = false } = {}) {
    aiPromptForcedVisible = false;
    if (preserveSupport && isSupportAgentPromptVisible() && isEditorPromptAvailable()) {
        positionPromptBox();
        showPromptBoxElement();
        updatePromptBusyUI();
        return;
    }
    clearSupportAgentPrompt();
    if (supportAgentTransitionTimer) {
        clearTimeout(supportAgentTransitionTimer);
        supportAgentTransitionTimer = null;
    }
    el.aiPromptBox?.classList.remove('is-transitioning-to-support');
    hidePromptBoxElement({ immediate });
    if (clearInput) {
        el.aiPromptInput.value = "";
        lastPromptInputValue = "";
        updatePromptInputLayout();
    }
    updatePromptPlaceholder();
    if (restoreEditorFocus && cmView) {
        cmView.focus();
    }
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
    if (!cmView || !isFIMEnabled()) return;
    if (aiRequestInFlight || aiRequestQueue.length > 0) return;
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
        // FIM 관련 
        const payload = {
            model: window.aiState.fimModel,
            prompt: `<|fim_prefix|>${prefix}<|fim_middle|><|fim_suffix|>${suffix}`,
            max_tokens: 64,
            stop: ["<|file_separator|>"],
            store: false
        };
        if (window.aiState.fimTemp > 0) {
            payload.temperature = window.aiState.fimTemp;
        }

        const responseJson = await MakeAIRequest(`${endpoint}/v1/completions`, headers, JSON.stringify(payload));
        if (requestSeq < fimRequestSeq) return;
        if (!cmView || cmView.composing || !isFIMEnabled()) return;

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

function getAIPromptRequestContext(selection) {
    const from = selection.from;
    const to = selection.to;
    const docText = cmView.state.doc.toString();
    return {
        tabId: state.activeTabId,
        path: state.editingSourcePath || state.currentFilePath,
        docText,
        selection: {
            from,
            to,
            head: selection.head,
            anchor: selection.anchor,
            empty: selection.empty,
            isAllSelected: from === 0 && to === docText.length,
        },
    };
}

function replaceTextRange(text, from, to, replacement) {
    const start = Math.max(0, Math.min(from, text.length));
    const end = Math.max(start, Math.min(to, text.length));
    return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

function isActiveAIRequestTab(requestContext) {
    const activePath = state.editingSourcePath || state.currentFilePath;
    return state.activeTabId === requestContext.tabId
        && state.isEditing
        && !!cmView
        && (!requestContext.path || activePath === requestContext.path);
}

function getAIRequestTab(requestContext) {
    const requestTab = state.tabs.find(tab => tab.id === requestContext.tabId) || null;
    if (!requestTab) {
        return null;
    }
    const tabPath = requestTab.editingSourcePath || requestTab.path;
    if (requestContext.path && tabPath !== requestContext.path) {
        return null;
    }
    return requestTab;
}

function updateInactiveAIRequestTab(requestContext, nextContent, selectionAnchor, selectionHead) {
    const requestTab = getAIRequestTab(requestContext);
    if (!requestTab) {
        return false;
    }
    requestTab.currentMarkdownSource = nextContent;
    requestTab.editorSelection = { anchor: selectionAnchor, head: selectionHead };
    requestTab.editorSelections = requestTab.editorSelections || {};
    const selectionKey = requestTab.editingSourcePath || requestContext.path || requestTab.path;
    if (selectionKey) {
        requestTab.editorSelections[selectionKey] = requestTab.editorSelection;
    }
    return true;
}

function dispatchToInactiveAIRequestTab(requestContext, transactionSpec, nextContent, selectionAnchor, selectionHead) {
    const requestTab = getAIRequestTab(requestContext);
    if (!requestTab) {
        return false;
    }
    if (requestTab.editorState?.doc?.toString?.() === requestTab.currentMarkdownSource) {
        try {
            const transaction = requestTab.editorState.update(transactionSpec);
            requestTab.editorState = transaction.state;
            requestTab.currentMarkdownSource = transaction.state.doc.toString();
            requestTab.editorSelection = {
                anchor: transaction.state.selection.main.anchor,
                head: transaction.state.selection.main.head,
            };
            requestTab.editorSelections = requestTab.editorSelections || {};
            const selectionKey = requestTab.editingSourcePath || requestContext.path || requestTab.path;
            if (selectionKey) {
                requestTab.editorSelections[selectionKey] = requestTab.editorSelection;
            }
            return true;
        } catch (error) {
            console.error('Failed to apply AI edit to inactive tab state', error);
        }
    }
    return updateInactiveAIRequestTab(requestContext, nextContent, selectionAnchor, selectionHead);
}

function applyAIInsertionToRequestTab(requestContext, insertionText) {
    const insertAt = requestContext.selection.head;
    if (isActiveAIRequestTab(requestContext)) {
        cmView.dispatch({
            changes: { from: insertAt, to: insertAt, insert: insertionText },
            selection: { anchor: insertAt + insertionText.length }
        });
        renderMarkdown(cmView.state.doc.toString());
        requestAnimationFrame(() => {
            cmView?.focus();
        });
        return true;
    }

    const requestTab = getAIRequestTab(requestContext);
    const baseText = requestTab?.currentMarkdownSource || requestContext.docText;
    const nextContent = replaceTextRange(baseText, insertAt, insertAt, insertionText);
    return dispatchToInactiveAIRequestTab(
        requestContext,
        {
            changes: { from: insertAt, to: insertAt, insert: insertionText },
            selection: EditorSelection.single(insertAt + insertionText.length),
        },
        nextContent,
        insertAt + insertionText.length,
        insertAt + insertionText.length
    );
}

function applyAIReplacementToRequestTab(requestContext, replacementText) {
    const { from, to, isAllSelected } = requestContext.selection;
    const nextHead = isAllSelected ? replacementText.length : from + replacementText.length;
    const nextAnchor = isAllSelected ? 0 : from;

    if (isActiveAIRequestTab(requestContext)) {
        cmView.dispatch({
            changes: { from, to, insert: replacementText },
            selection: { anchor: nextAnchor, head: nextHead }
        });
        renderMarkdown(cmView.state.doc.toString());
        requestAnimationFrame(() => {
            cmView?.focus();
        });
        return true;
    }

    const requestTab = getAIRequestTab(requestContext);
    const baseText = requestTab?.currentMarkdownSource || requestContext.docText;
    const nextContent = replaceTextRange(baseText, from, to, replacementText);
    return dispatchToInactiveAIRequestTab(
        requestContext,
        {
            changes: { from, to, insert: replacementText },
            selection: EditorSelection.single(nextAnchor, nextHead),
        },
        nextContent,
        nextAnchor,
        nextHead
    );
}

function enqueueAIRequest(job) {
    aiRequestQueue.push(job);
    updateActiveAIProgressQueueLabel();
    showToast(getAIQueuedCount() > 1 ? `${getAIQueuedCount()} AI requests queued.` : "AI request queued.");
    queueMicrotask(processAIRequestQueue);
}

export function enqueueLLMTask({ label = "AI task", run } = {}) {
    if (typeof run !== 'function') {
        return Promise.reject(new Error('LLM task runner is required'));
    }
    return new Promise((resolve, reject) => {
        enqueueAIRequest({
            id: ++nextAIQueueJobId,
            label,
            cancelled: false,
            run,
            resolve,
            reject,
        });
    });
}

async function processAIRequestQueue() {
    if (aiRequestInFlight || activeAIQueueJob) {
        return;
    }

    const job = aiRequestQueue.shift();
    if (!job) {
        return;
    }
    if (job.cancelled) {
        job.reject?.(new Error('context canceled'));
        queueMicrotask(processAIRequestQueue);
        return;
    }
    if (!isGeneralAIActive()) {
        aiRequestQueue = [];
        hideAIProgressOverlay();
        return;
    }

    activeAIQueueJob = job;
    aiRequestInFlight = true;
    clearSupportAgentPrompt();
    showPromptBusyState({ label: job.label || '프롬프트 처리 중', progress: 0 });

    try {
        const result = typeof job.run === 'function'
            ? await job.run({ isCancelled: () => !!job.cancelled })
            : await runAIRequestJob(job);
        job.resolve?.(result);
    } catch (err) {
        console.error("AI prompt error", err);
        if (isCancellationError(err) || job.cancelled) {
            showToast("AI request cancelled.");
        } else if (typeof job.run !== 'function') {
            showToast("AI request failed. ❌");
        }
        job.reject?.(err);
        hideAIProgressOverlay();
    } finally {
        if (activeAIQueueJob?.id === job.id) {
            activeAIQueueJob = null;
        }
        aiRequestInFlight = false;
        clearPromptBusyState();
        queueMicrotask(processAIRequestQueue);
    }
}

async function runAIRequestJob(job) {
    let endpoint = job.endpoint;
    let resultText = "";
    let supportReport = "";

    if (job.provider === "lmstudio") {
        let base = endpoint.replace(/\/$/, "");
        base = base.replace(/\/api\/v1$/, "").replace(/\/v1$/, "");
        endpoint = base + "/api/v1/chat";

        const payload = {
            model: job.model,
            input: `${job.systemPrompt}\n\n${job.contextualPrompt}`,
            stream: true
        };
        if (job.temperature > 0) payload.temperature = job.temperature;

        resultText = await MakeLMStudioRequest(endpoint, job.headers, JSON.stringify(payload));
    } else {
        let base = endpoint.replace(/\/$/, "");
        if (!base.endsWith("/v1")) {
            base = base + "/v1";
        }
        endpoint = base + "/chat/completions";

        const payload = {
            model: job.model,
            messages: [
                { role: "system", content: job.systemPrompt },
                { role: "user", content: job.contextualPrompt }
            ],
            stream: true,
            store: false
        };
        if (job.temperature > 0) payload.temperature = job.temperature;

        const responseJson = await MakeAIRequest(endpoint, job.headers, JSON.stringify(payload));
        const data = JSON.parse(responseJson);
        resultText = data.choices[0].message.content;
    }

    if (job.cancelled) {
        throw new Error('AI request cancelled');
    }
    if (!isGeneralAIActive()) {
        hideAIProgressOverlay();
        return;
    }

    const { hasSelection, requestContext, userPrompt, docText } = job;
    const hasIntent = containsIntentTag(resultText);
    const hasTaggedSupportReport = containsSupportReportTag(resultText);
    const structuredPayload = (hasIntent || hasTaggedSupportReport)
        ? extractStructuredAIPayload(resultText)
        : null;

    if (!hasSelection) {
        const shouldInsertAtCursor = isLikelyInsertionPrompt(userPrompt);
        if (!structuredPayload && shouldInsertAtCursor) {
            const insertionText = extractFallbackAIReplacement(resultText);
            if (insertionText.trim()) {
                applyAIInsertionToRequestTab(requestContext, insertionText);
                return;
            }
        }
        if ((structuredPayload?.intent === AI_INTENT_VALUES.question || structuredPayload?.intent === AI_INTENT_VALUES.ambiguous) &&
            shouldInsertAtCursor &&
            structuredPayload?.replacement?.trim()) {
            structuredPayload.intent = AI_INTENT_VALUES.edit;
        }
        if (structuredPayload?.intent === AI_INTENT_VALUES.edit) {
            const insertionText = structuredPayload.replacement || extractFallbackAIReplacement(resultText);
            if (insertionText.trim()) {
                applyAIInsertionToRequestTab(requestContext, insertionText);
                if (state.aiSupportAgentEnabled || structuredPayload.report) {
                    showSupportAgentPromptForRequestTab(requestContext, structuredPayload.report || SUPPORT_AGENT_FALLBACK_REPORT);
                }
                return;
            }
        }
        const questionReport = structuredPayload
            ? structuredPayload.report
            : normalizeSupportReport(resultText);
        showSupportAgentPromptForRequestTab(requestContext, questionReport);
        return;
    }

    const shouldForceEditIntent = hasSelection && isLikelySelectedTextTransformPrompt(userPrompt);
    if ((structuredPayload?.intent === AI_INTENT_VALUES.question || structuredPayload?.intent === AI_INTENT_VALUES.ambiguous) &&
        shouldForceEditIntent &&
        structuredPayload?.replacement?.trim()) {
        structuredPayload.intent = AI_INTENT_VALUES.edit;
    }

    if (structuredPayload?.intent === AI_INTENT_VALUES.question || structuredPayload?.intent === AI_INTENT_VALUES.ambiguous) {
        showSupportAgentPromptForRequestTab(requestContext, structuredPayload.report || normalizeSupportReport(resultText));
        return;
    }

    if (structuredPayload?.intent === AI_INTENT_VALUES.edit) {
        resultText = structuredPayload.replacement || docText.slice(requestContext.selection.from, requestContext.selection.to);
        supportReport = structuredPayload.report;
    } else if (state.aiSupportAgentEnabled || hasTaggedSupportReport) {
        resultText = structuredPayload?.replacement || docText.slice(requestContext.selection.from, requestContext.selection.to);
        supportReport = structuredPayload?.report || normalizeSupportReport(resultText);
    } else {
        resultText = resultText.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
    }

    applyAIReplacementToRequestTab(requestContext, resultText);
    if (state.aiSupportAgentEnabled || (hasTaggedSupportReport && !structuredPayload?.intent)) {
        showSupportAgentPromptForRequestTab(requestContext, supportReport);
    }
}

async function sendPrompt() {
    if (!isGeneralAIActive()) {
        hidePromptBox();
        showToast(isAIFeaturesDisabled() ? "AI features are disabled in Advanced Options." : "General AI is disabled in AI Settings.");
        return;
    }
    if (isSupportAgentPromptVisible()) {
        return;
    }

    const userPrompt = el.aiPromptInput.value.trim();
    if (!userPrompt || !cmView) return;
    lastPromptInputValue = "";

    const sel = cmView.state.selection.main;
    const requestContext = getAIPromptRequestContext(sel);
    const hasSelection = !requestContext.selection.empty;
    const docText = requestContext.docText;
    const contextualPrompt = hasSelection
        ? buildAIIntentPrompt(docText, requestContext.selection.from, requestContext.selection.to, userPrompt).prompt
        : buildAskAIQuestionPrompt(userPrompt);
    const systemPrompt = hasSelection ? getAIEditSystemPrompt() : getAIQuestionSystemPrompt();
    if (state.aiSupportAgentEnabled || !hasSelection) {
        clearSupportAgentPrompt();
    }

    let endpoint = window.aiState.generalEndpoint.trim();
    if (!endpoint.startsWith("http")) endpoint = `http://${endpoint}`;

    const headers = { "Content-Type": "application/json" };
    if (window.aiState.generalKey) headers["Authorization"] = `Bearer ${window.aiState.generalKey}`;

    enqueueAIRequest({
        id: ++nextAIQueueJobId,
        label: '프롬프트 처리 중',
        cancelled: false,
        userPrompt,
        requestContext,
        hasSelection,
        docText,
        contextualPrompt,
        systemPrompt,
        provider: window.aiState.generalProvider,
        endpoint,
        headers,
        model: window.aiState.generalModel,
        temperature: window.aiState.generalTemp,
    });

    hidePromptBox({ restoreEditorFocus: true });
}

export function syncAIControls() {
    const generalAvailable = isGeneralAIAvailable();
    const generalToolbarEnabled = isGeneralAIToolbarEnabled();
    const toolbarCollapsed = generalToolbarEnabled && !!state.aiToolbarCollapsed;
    const fimAvailable = isFIMAvailable();
    const aiRequiredToolDisabled = !generalAvailable;
    const aiRequiredTooltip = "AI features required";
    const generalDisabledMessage = "General AI is disabled in AI Settings.";
    const fimDisabledMessage = "FIM is disabled in AI Settings.";
    const aiDisabledMessage = "AI features are disabled in Advanced Options.";

    if (!isFIMEnabled()) {
        clearGhostText();
    }
    if (!aiRequestInFlight && !aiPromptBusyState && !isSupportAgentPromptVisible()) {
        showPendingSupportAgentPromptForActiveTab();
    }
    if (!state.isEditing && isPromptBoxVisible()) {
        hidePromptBox({ restoreEditorFocus: false, immediate: true });
    }
    const showAiDock = state.isEditing && generalAvailable;
    if (showAiDock) {
        showAIDock();
    } else {
        hideAIDock({ immediate: !state.isEditing });
    }
    el.editorAiDock.classList.toggle('is-expanded', generalToolbarEnabled);
    el.editorAiDock.classList.toggle('is-collapsed', showAiDock && !generalToolbarEnabled);
    el.editorAiDock.classList.toggle('is-toolbar-collapsed', toolbarCollapsed);
    if (showAiDock && generalToolbarEnabled && !toolbarCollapsed) {
        showAIPanel();
    } else {
        hideAIPanel({ immediate: !state.isEditing });
    }
    el.edAiToolbarToggle.classList.toggle('hidden', !generalToolbarEnabled);
    el.edGeneralTempControl.classList.toggle('hidden', !generalToolbarEnabled);
    el.edFimGroup.classList.toggle('hidden', !generalToolbarEnabled || !fimAvailable);
    el.edContextPlusGroup.classList.toggle('hidden', !generalToolbarEnabled);
    el.edGithubCompatibleGroup.classList.toggle('hidden', !generalToolbarEnabled);
    el.edSupportAgentGroup.classList.toggle('hidden', !generalToolbarEnabled);
    el.edAiToolbarToggle.title = toolbarCollapsed ? "Show AI Toolbar" : "Hide AI Toolbar";
    el.edAiToolbarToggle.setAttribute('aria-label', toolbarCollapsed ? "Show AI Toolbar" : "Hide AI Toolbar");

    el.edGeneralAi.classList.toggle('active-ai', generalToolbarEnabled);
    el.edGeneralAi.classList.toggle('disabled', !generalAvailable);
    el.edGeneralAi.setAttribute('aria-disabled', String(!generalAvailable));
    el.edGeneralAi.title = generalAvailable ? "Toggle General AI" : (isAIFeaturesDisabled() ? aiDisabledMessage : generalDisabledMessage);
    if (generalAvailable) {
        el.edGeneralAi.removeAttribute('data-tooltip');
    } else {
        el.edGeneralAi.setAttribute('data-tooltip', isAIFeaturesDisabled() ? aiDisabledMessage : generalDisabledMessage);
    }

    el.edFim.classList.toggle('active-fim', isFIMEnabled());
    el.edFim.classList.toggle('disabled', !fimAvailable);
    el.edFim.setAttribute('aria-disabled', String(!fimAvailable));
    el.edFim.title = fimAvailable ? "Toggle FIM (AI Autocomplete)" : (isAIFeaturesDisabled() ? aiDisabledMessage : fimDisabledMessage);
    if (fimAvailable) {
        el.edFim.removeAttribute('data-tooltip');
    } else {
        el.edFim.setAttribute('data-tooltip', isAIFeaturesDisabled() ? aiDisabledMessage : fimDisabledMessage);
    }

    el.edGithubCompatible.classList.toggle('active-github-compatible', !!state.aiGithubCompatibleEnabled);
    el.edGithubCompatible.title = state.aiGithubCompatibleEnabled
        ? "Disable GitHub Compatible AI Edits"
        : "Enable GitHub Compatible AI Edits";

    el.edSupportAgent.classList.toggle('active-ai', !!state.aiSupportAgentEnabled);
    el.edSupportAgent.classList.toggle('disabled', !generalAvailable);
    el.edSupportAgent.setAttribute('aria-disabled', String(!generalAvailable));
    el.edSupportAgent.title = generalAvailable
        ? (state.aiSupportAgentEnabled ? "Disable Support Agent" : "Enable Support Agent")
        : (isAIFeaturesDisabled() ? aiDisabledMessage : generalDisabledMessage);
    if (generalAvailable) {
        el.edSupportAgent.removeAttribute('data-tooltip');
    } else {
        el.edSupportAgent.setAttribute('data-tooltip', isAIFeaturesDisabled() ? aiDisabledMessage : generalDisabledMessage);
    }

    el.edContextPlus.classList.toggle('active-ai', !!state.aiSelectionContextEnabled && generalAvailable);
    el.edContextPlus.classList.toggle('disabled', !generalAvailable);
    el.edContextPlus.setAttribute('aria-disabled', String(!generalAvailable));
    el.edContextPlus.title = generalAvailable
        ? (state.aiSelectionContextEnabled
            ? "Disable surrounding context for AI edits"
            : "Enable surrounding context for AI edits")
        : (isAIFeaturesDisabled() ? aiDisabledMessage : generalDisabledMessage);
    if (generalAvailable) {
        el.edContextPlus.removeAttribute('data-tooltip');
    } else {
        el.edContextPlus.setAttribute('data-tooltip', isAIFeaturesDisabled() ? aiDisabledMessage : generalDisabledMessage);
    }

    [
        { button: el.edSpellcheck, enabledTitle: "Spellcheck" },
        { button: el.edTranslateDoc, enabledTitle: "Translate Document" },
        { button: el.btnTranslate, enabledTitle: "Translate" },
    ].forEach(({ button, enabledTitle }) => {
        if (!button) return;
        button.classList.toggle('disabled', aiRequiredToolDisabled);
        button.classList.toggle('ai-required-disabled', aiRequiredToolDisabled);
        button.setAttribute('aria-disabled', String(aiRequiredToolDisabled));
        button.setAttribute('aria-label', aiRequiredToolDisabled ? aiRequiredTooltip : enabledTitle);
        if (aiRequiredToolDisabled) {
            button.removeAttribute('title');
            button.setAttribute('data-tooltip', aiRequiredTooltip);
        } else {
            button.title = enabledTitle;
            button.removeAttribute('data-tooltip');
        }
    });
    syncGeneralTemperatureControl();

    if (!generalToolbarEnabled) {
        if (!el.aiPromptBox.classList.contains('hidden')) {
            hidePromptBox({ restoreEditorFocus: false });
        }
    }
    if (isAIFeaturesDisabled()) {
        hidePromptBox({ restoreEditorFocus: false });
    }
    if (!state.aiSupportAgentEnabled) {
        clearSupportAgentPrompt();
    }
    if (isAIFeaturesDisabled()) {
        clearSupportAgentPrompt();
    }
}

function syncAISettingsSections() {
    const aiDisabled = el.aiFeaturesDisabled.checked;
    if (el.aiFeaturesEnabled) {
        el.aiFeaturesEnabled.checked = !aiDisabled;
    }
    syncSettingsSwitchLabels();

    const lockedControls = [
        el.aiGeneralProvider,
        el.aiGeneralEndpoint,
        el.aiGeneralModel,
        el.aiGeneralModelTrigger,
        el.aiGeneralKey,
        el.aiGeneralTemp,
        el.aiFimEndpoint,
        el.aiFimModel,
        el.aiFimKey,
        el.aiFimTemp,
    ];

    for (const control of lockedControls) {
        if (control) {
            control.disabled = aiDisabled;
        }
    }

    document.querySelectorAll('.ai-settings-panels .ai-setting-group').forEach((group) => {
        group.classList.toggle('is-locked', aiDisabled);
    });
    document.querySelectorAll('#settings-panel-ai .ai-setting-option').forEach((option) => {
        const containsUnlockedControl = option.contains(el.aiFeaturesDisabled);
        option.classList.toggle('is-locked', aiDisabled && !containsUnlockedControl);
    });
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

function escapeHTMLAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getGeneralAIHeaders() {
    const headers = {};
    const key = el.aiGeneralKey.value.trim();
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

function handleDocumentClickForModelPopover(event) {
    if (isGeneralModelPopoverOpen() && !el.aiGeneralModelPicker.contains(event.target)) {
        closeGeneralModelPopover();
    }
}

function handleDocumentKeydownForModelPopover(event) {
    if (event.key === 'Escape' && isGeneralModelPopoverOpen()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeGeneralModelPopover();
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
        updateSettingsDirtyState();
        return;
    }

    if (action === 'unload') {
        const instanceID = actionTarget.dataset.instanceId || "";
        if (!instanceID || unloadingInstanceId) return;
        unloadGeneralModelInstance(instanceID);
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
