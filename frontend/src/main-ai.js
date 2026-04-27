/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { state, el } from './main-state.js';
import { GetSettings, SaveSettings, MakeAIRequest, MakeLMStudioRequest, GetAIModelCatalog, GetAIModelList, UnloadAIModel, CancelAIRequest } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { cmView, insertPlainTextAtCursor } from './main-editor.js';
import { showToast } from './main-ui.js';
import { renderMarkdown } from './main-render.js';
import { AI_SUPPORT_AGENT_POP_MS, AI_SUPPORT_AGENT_POP_ORIGIN, AI_SUPPORT_AGENT_POP_SCALE } from './config.js';
import gfmReference from './prompts/GFM.md?raw';
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
const FIM_PREFIX_LIMIT = 600;
const FIM_SUFFIX_LIMIT = 200;
let lmStudioModels = [];
let lmStudioModelsLoading = false;
let lmStudioModelsError = "";
let unloadingInstanceId = "";
let aiRequestInFlight = false;
let aiPromptHideTimer = null;
let aiPromptBusyState = null;
let supportAgentPromptText = "";
let supportAgentTransitionTimer = null;
let lastPromptInputValue = "";
let aiPromptForcedVisible = false;
let aiDockHideTimer = null;
let aiPanelHideTimer = null;
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
    'First decide whether the user request is a question or ambiguous.',
    'Return your response using exactly these XML blocks in this order:',
    '<intent>question|ambiguous</intent>',
    '<support_report>short answer for the user</support_report>',
    '<replacement></replacement>',
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

function updatePromptBusyUI() {
    const isBusy = !!aiPromptBusyState;
    const isSupportAgentVisible = !!supportAgentPromptText && !isBusy;
    const promptValue = isBusy
        ? (aiPromptBusyState.inputText || '')
        : (isSupportAgentVisible ? supportAgentPromptText : lastPromptInputValue);

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

    if (isBusy) {
        el.aiPromptBox.style.setProperty('--ai-prompt-progress', `${aiPromptBusyState.progress}%`);
        el.aiPromptInput.value = promptValue;
        el.aiPromptInput.placeholder = aiPromptBusyState.placeholder;
    } else {
        el.aiPromptBox.style.setProperty('--ai-prompt-progress', '0%');
        el.aiPromptInput.disabled = false;
        el.aiPromptInput.value = promptValue;
        if (isSupportAgentVisible) {
            el.aiPromptInput.placeholder = '';
        } else {
            updatePromptPlaceholder();
        }
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
    positionPromptBox();
    showPromptBoxElement();
    updatePromptBusyUI();
}

function setPromptBusyInputText(value = "") {
    if (!aiPromptBusyState) {
        return;
    }
    aiPromptBusyState = {
        ...aiPromptBusyState,
        inputText: String(value || ""),
    };
    updatePromptBusyUI();
}

function clearPromptBusyState() {
    aiPromptBusyState = null;
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
    supportAgentPromptText = normalizeSupportReport(reportText);
    positionPromptBox();
    showPromptBoxElement();
    if (el.aiPromptBox) {
        el.aiPromptBox.classList.remove('is-transitioning-to-support');
        if (supportAgentTransitionTimer) {
            clearTimeout(supportAgentTransitionTimer);
        }
        requestAnimationFrame(() => {
            el.aiPromptBox.classList.add('is-transitioning-to-support');
            supportAgentTransitionTimer = setTimeout(() => {
                el.aiPromptBox?.classList.remove('is-transitioning-to-support');
                supportAgentTransitionTimer = null;
            }, AI_SUPPORT_AGENT_POP_MS);
        });
    }
    updatePromptBusyUI();
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
            if (!el.aiPromptInput.disabled) {
                el.aiPromptInput.focus();
                updatePromptPlaceholder();
            }
        });
    }
}

function hideAIProgressOverlay() {
    clearPromptBusyState();
    requestAnimationFrame(() => {
        refreshPromptForSelection({ preserveInput: false });
    });
}

function isAIProgressVisible() {
    return !!aiPromptBusyState;
}

async function cancelActiveAIRequest() {
    if (!aiRequestInFlight) {
        clearPromptBusyState();
        return;
    }

    aiRequestInFlight = false;
    hideAIProgressOverlay();
    try {
        await CancelAIRequest();
    } catch (error) {
        console.error('Failed to cancel AI request', error);
    }
    showToast("AI request cancelled.");
}

function isCancelledAIError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('context canceled') || message.includes('context cancelled') || message.includes('canceled');
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

function getGithubCompatiblePromptSections() {
    if (!state.aiGithubCompatibleEnabled) return [];
    return [
        buildMarkdownSection('GitHub Compatible Mode', [
            'Use the bundled GFM examples as the style reference for Markdown output.',
            'Prefer Markdown first; use simple GitHub-safe HTML only when the examples show it or Markdown cannot express the result clearly.',
            'Do not use font tags, inline CSS layout, or unsupported Markdown extensions.',
            'When content is wrapped in <div> tags, convert Markdown image syntax (e.g., ![alt](image.png)) into standard HTML <img> tags.',
        ]),
        buildRawMarkdownSection('GFM Examples', gfmReference),
    ];
}

function buildAskAIQuestionPrompt(userPrompt) {
    return joinPromptSections(
        buildMarkdownSection('Shared Rules', getSharedRulePromptLines()),
        buildMarkdownSection('Rules', ASK_AI_PROMPT_LINES),
        ...getGithubCompatiblePromptSections(),
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

function getIntentAwareInstructionLines({ includeContext }) {
    return [
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
        ...getGithubCompatiblePromptSections(),
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
            instructionLines: getIntentAwareInstructionLines({ includeContext }),
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
            'When no text is selected, answer simple user questions instead of editing the document.',
            'Internally reason about whether the request is a clear question or ambiguous, but do not reveal the reasoning steps.',
        ]),
        buildMarkdownSection('Shared Rules', AI_SHARED_RULE_PROMPT_LINES),
        buildMarkdownSection('Response Format', [
            'Return exactly three XML blocks in this order: <intent>...</intent><support_report>...</support_report><replacement>...</replacement>.',
            `Use only <intent>question</intent> or <intent>ambiguous</intent>, keep <support_report> within ${SUPPORT_REPORT_MAX_CHARS} characters, and keep <replacement></replacement> empty.`,
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

    if (!replacementMatch) {
        replacement = source
            .replace(/<intent>[\s\S]*?<\/intent>/gi, '')
            .replace(/<support_report>[\s\S]*?<\/support_report>/gi, '')
            .replace(/<\/?replacement>/gi, '')
            .trim();
    }

    replacement = replacement.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');

    return {
        intent,
        report: normalizeSupportReport(report),
        replacement,
    };
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

function hideAIDock() {
    if (el.editorAiDock.classList.contains('hidden')) return;
    clearTimeout(aiDockHideTimer);
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

function hideAIPanel() {
    if (el.editorAiPanel.classList.contains('hidden')) return;
    clearTimeout(aiPanelHideTimer);
    el.editorAiPanel.classList.remove('is-visible');
    el.editorAiPanel.classList.add('is-hiding');
    aiPanelHideTimer = setTimeout(() => {
        el.editorAiPanel.classList.remove('is-hiding');
        el.editorAiPanel.classList.add('hidden');
    }, AI_DOCK_FADE_MS);
}

function updatePromptInputLayout() {
    if (!el.aiPromptInput || !el.aiPromptBox) return;
    if (aiPromptBusyState) {
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

function showPromptBoxElement() {
    clearTimeout(aiPromptHideTimer);
    updatePromptInputLayout();
    el.aiPromptBox.classList.remove('hidden', 'is-leaving');
    requestAnimationFrame(() => {
        el.aiPromptBox.classList.add('is-visible');
    });
}

function hidePromptBoxElement() {
    if (el.aiPromptBox.classList.contains('hidden')) return;
    clearTimeout(aiPromptHideTimer);
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
    if (!isGeneralAIActive() || isAIProgressVisible()) return false;
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
    clearPromptBusyState();
    showPromptBoxElement();
    updatePromptPlaceholder();
    if (focusInput) {
        requestAnimationFrame(() => {
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
    if (isAIProgressVisible()) {
        positionPromptBox();
        showPromptBoxElement();
        updatePromptBusyUI();
        return true;
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
    await SaveSettings({
        theme: document.documentElement.classList.contains('dark') ? "dark" : "light",
        fontSize: state.currentFontSize,
        engine: state.currentMarkdownEngine,
        editorRenderMode: state.currentEditorRenderMode,
        aiFeaturesDisabled: state.aiFeaturesDisabled,
        aiGeneralEnabled: window.aiState.generalAvailable,
        aiGeneralToolbarEnabled: window.aiState.generalToolbarEnabled,
        aiToolbarCollapsed: state.aiToolbarCollapsed,
        aiGeneralProvider: window.aiState.generalProvider,
        aiGeneralEndpoint: window.aiState.generalEndpoint,
        aiGeneralModel: window.aiState.generalModel,
        aiGeneralKey: window.aiState.generalKey,
        aiGeneralTemp: window.aiState.generalTemp,
        aiFimEnabled: window.aiState.fimAvailable,
        aiFimToolbarEnabled: window.aiState.fimEnabled,
        aiFimEndpoint: window.aiState.fimEndpoint,
        aiFimModel: window.aiState.fimModel,
        aiFimKey: window.aiState.fimKey,
        aiFimTemp: window.aiState.fimTemp,
        aiSelectionContext: state.aiSelectionContextEnabled,
        aiGithubCompatible: state.aiGithubCompatibleEnabled,
        aiSupportAgent: state.aiSupportAgentEnabled,
        koreanImeEnterFix: el.aiToggleImeFix.checked,
    });
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
    window.aiState = aiState;
    syncAISettingsSections();
    syncAIControls();
    syncGeneralTemperatureControl();
    syncGeneralModelControl();
    updateGeneralModelTrigger();

    return aiState;
}

export function bindAIEvents() {
    el.aiFeaturesDisabled.addEventListener('change', syncAISettingsSections);
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
        syncAISettingsSections();
        syncGeneralModelControl();
        if (el.aiGeneralProvider.value === 'lmstudio') {
            refreshLMStudioModels({ keepOpen: false });
        }
        el.aiSettingsModal.classList.remove('hidden');
    };
    el.aiSettingsCancel.onclick = () => {
        closeGeneralModelPopover();
        el.aiSettingsModal.classList.add('hidden');
    };
    el.aiSettingsSave.onclick = async () => {
        state.aiFeaturesDisabled = el.aiFeaturesDisabled.checked;
        if (state.aiFeaturesDisabled && aiRequestInFlight) {
            await cancelActiveAIRequest();
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
        await persistAISettings();

        state.koreanImeFixEnabled = el.aiToggleImeFix.checked;
        syncAIControls();
        syncGeneralTemperatureControl();

        closeGeneralModelPopover();
        el.aiSettingsModal.classList.add('hidden');
        showToast("AI Settings Saved.");
    };

    // AI Progress Events from Go
    EventsOn('ai:progress', (data) => {
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
        if (isAIProgressVisible()) {
            cancelActiveAIRequest();
            return;
        }
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
    if (isAIProgressVisible()) {
        positionPromptBox();
        showPromptBoxElement();
        updatePromptBusyUI();
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
    if (!state.isEditing || !cmView) {
        showToast("Ask AI is available in editor mode.");
        return false;
    }
    if (!isGeneralAIActive()) {
        showToast(isAIFeaturesDisabled() ? "AI features are disabled in Advanced Options." : "General AI is disabled in AI Settings.");
        return false;
    }
    return showPromptBox({ focusInput: true, preserveInput: true, allowEmptySelection: true });
}

function hidePromptBox({ clearInput = true, restoreEditorFocus = true } = {}) {
    if (isAIProgressVisible()) return;
    aiPromptForcedVisible = false;
    clearSupportAgentPrompt();
    if (supportAgentTransitionTimer) {
        clearTimeout(supportAgentTransitionTimer);
        supportAgentTransitionTimer = null;
    }
    el.aiPromptBox?.classList.remove('is-transitioning-to-support');
    hidePromptBoxElement();
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
            stop: ["<|file_separator|>"]
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
    const hasSelection = !sel.empty;
    const isAllSelected = sel.from === 0 && sel.to === cmView.state.doc.length;
    const docText = cmView.state.doc.toString();
    const contextualPrompt = hasSelection
        ? buildAIIntentPrompt(docText, sel.from, sel.to, userPrompt).prompt
        : buildAskAIQuestionPrompt(userPrompt);
    const systemPrompt = hasSelection ? getAIEditSystemPrompt() : getAIQuestionSystemPrompt();
    if (state.aiSupportAgentEnabled || !hasSelection) {
        clearSupportAgentPrompt();
    }

    // Hide prompt box immediately so user can see the editor
    showPromptBusyState({ label: '프롬프트 처리 중', progress: 0 });

    aiRequestInFlight = true;
    let endpoint = window.aiState.generalEndpoint.trim();
    if (!endpoint.startsWith("http")) endpoint = `http://${endpoint}`;

    try {
        let resultText = "";
        let supportReport = "";

        if (window.aiState.generalProvider === "lmstudio") {
            // LM Studio Native logic: baseUrl/api/v1/chat
            let base = endpoint.replace(/\/$/, "");
            base = base.replace(/\/api\/v1$/, "").replace(/\/v1$/, "");
            endpoint = base + "/api/v1/chat";

            const payload = {
                model: window.aiState.generalModel,
                input: `${systemPrompt}\n\n${contextualPrompt}`,
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
                    { role: "system", content: systemPrompt },
                    { role: "user", content: contextualPrompt }
                ]
            };
            if (window.aiState.generalTemp > 0) payload.temperature = window.aiState.generalTemp;

            const responseJson = await MakeAIRequest(endpoint, headers, JSON.stringify(payload));
            const data = JSON.parse(responseJson);
            resultText = data.choices[0].message.content;
        }

        if (!isGeneralAIActive()) {
            hideAIProgressOverlay();
            return;
        }

        const hasIntent = containsIntentTag(resultText);
        const hasTaggedSupportReport = containsSupportReportTag(resultText);
        const structuredPayload = (hasIntent || hasTaggedSupportReport)
            ? extractStructuredAIPayload(resultText)
            : null;

        if (!hasSelection) {
            const questionReport = structuredPayload
                ? structuredPayload.report
                : normalizeSupportReport(resultText);
            showSupportAgentPrompt(questionReport);
            requestAnimationFrame(() => {
                cmView?.focus();
            });
            aiRequestInFlight = false;
            return;
        }

        if (structuredPayload?.intent === AI_INTENT_VALUES.question || structuredPayload?.intent === AI_INTENT_VALUES.ambiguous) {
            showSupportAgentPrompt(structuredPayload.report || normalizeSupportReport(resultText));
            requestAnimationFrame(() => {
                cmView?.focus();
            });
            aiRequestInFlight = false;
            return;
        }

        if (structuredPayload?.intent === AI_INTENT_VALUES.edit) {
            resultText = structuredPayload.replacement || docText.slice(sel.from, sel.to);
            supportReport = structuredPayload.report;
        } else if (state.aiSupportAgentEnabled || hasTaggedSupportReport) {
            resultText = structuredPayload?.replacement || docText.slice(sel.from, sel.to);
            supportReport = structuredPayload?.report || normalizeSupportReport(resultText);
        } else {
            resultText = resultText.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
        }

        cmView.dispatch({
            changes: { from: sel.from, to: sel.to, insert: resultText },
            selection: isAllSelected
                ? { anchor: 0, head: resultText.length }
                : { anchor: sel.from, head: sel.from + resultText.length }
        });

        renderMarkdown(cmView.state.doc.toString());
        if (state.aiSupportAgentEnabled || (hasTaggedSupportReport && !structuredPayload?.intent)) {
            showSupportAgentPrompt(supportReport);
        }
        requestAnimationFrame(() => {
            cmView?.focus();
        });
        aiRequestInFlight = false;
    } catch (err) {
        aiRequestInFlight = false;
        console.error("AI prompt error", err);
        if (isCancelledAIError(err)) {
            showToast("AI request cancelled.");
        } else {
            showToast("AI request failed. ❌");
        }
        hideAIProgressOverlay();
    } finally {
        clearPromptBusyState();
    }
}

export function syncAIControls() {
    const generalAvailable = isGeneralAIAvailable();
    const generalToolbarEnabled = isGeneralAIToolbarEnabled();
    const toolbarCollapsed = generalToolbarEnabled && !!state.aiToolbarCollapsed;
    const fimAvailable = isFIMAvailable();
    const generalDisabledMessage = "General AI is disabled in AI Settings.";
    const fimDisabledMessage = "FIM is disabled in AI Settings.";
    const aiDisabledMessage = "AI features are disabled in Advanced Options.";

    if (!isFIMEnabled()) {
        clearGhostText();
    }
    const showAiDock = state.isEditing && generalAvailable;
    if (showAiDock) {
        showAIDock();
    } else {
        hideAIDock();
    }
    el.editorAiDock.classList.toggle('is-expanded', generalToolbarEnabled);
    el.editorAiDock.classList.toggle('is-collapsed', showAiDock && !generalToolbarEnabled);
    el.editorAiDock.classList.toggle('is-toolbar-collapsed', toolbarCollapsed);
    if (showAiDock && generalToolbarEnabled && !toolbarCollapsed) {
        showAIPanel();
    } else {
        hideAIPanel();
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
            control.disabled = aiDisabled || control.disabled;
        }
    }

    document.querySelectorAll('.ai-settings-panels .ai-setting-group').forEach((group) => {
        group.classList.toggle('is-locked', aiDisabled);
    });
    document.querySelectorAll('.ai-setting-group-editor .ai-setting-option').forEach((option) => {
        const containsUnlockedControl = option.contains(el.aiFeaturesDisabled) || option.contains(el.aiToggleImeFix);
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
    if (event.key === 'Escape') {
        if (isGeneralModelPopoverOpen()) closeGeneralModelPopover();
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
