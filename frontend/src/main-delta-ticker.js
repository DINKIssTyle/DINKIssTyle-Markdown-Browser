/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

const DEFAULT_SENTENCE_END_PATTERN = /[.!?。！？)]$/;

export function normalizeDeltaText(value = "", { stripJsonPunctuation = false } = {}) {
    let text = String(value || "")
        .replace(/\\n/g, " ")
        .replace(/```[\s\S]*?```/g, "code block");
    text = stripJsonPunctuation
        ? text.replace(/[{}\[\]",:]+/g, " ").replace(/[`*_>#|~-]+/g, " ")
        : text.replace(/[`*_>#\[\](){}|~-]+/g, " ");
    return text.replace(/\s+/g, " ").trim();
}

export function createDeltaTicker({
    render,
    clearRender = () => {},
    normalize = normalizeDeltaText,
    intervalMs = 180,
    coalesceMs = 220,
    minChars = 18,
    maxQueue = 18,
    maxChars = 88,
    canShow = () => true,
    merge = (lastQueued, nextText) => `${lastQueued}${nextText}`,
    sentenceEndPattern = DEFAULT_SENTENCE_END_PATTERN,
} = {}) {
    let timer = null;
    let coalesceTimer = null;
    let pendingText = "";
    let queue = [];

    function preview(value = "") {
        const normalized = normalize(value);
        if (!normalized) {
            return "";
        }
        if (normalized.length <= maxChars) {
            return normalized;
        }
        return `${normalized.slice(0, maxChars - 1).trim()}...`;
    }

    function flushQueue() {
        timer = null;
        const next = queue.shift();
        if (next) {
            render(next);
        }
        if (queue.length > 0) {
            timer = setTimeout(flushQueue, intervalMs);
        }
    }

    function enqueue(nextText = "") {
        if (!nextText) {
            return;
        }
        const lastQueued = queue[queue.length - 1];
        const merged = lastQueued ? merge(lastQueued, nextText) : "";
        if (lastQueued && typeof merged === "string" && merged.length <= maxChars) {
            queue[queue.length - 1] = merged;
        } else {
            queue.push(nextText);
        }
        if (queue.length > maxQueue) {
            queue = queue.slice(-maxQueue);
        }
        if (!timer) {
            flushQueue();
        }
    }

    function flushPending() {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
        const nextText = preview(pendingText);
        pendingText = "";
        enqueue(nextText);
    }

    function push(value = "") {
        if (!canShow()) {
            return;
        }
        pendingText = `${pendingText}${value}`;
        const nextPreview = preview(pendingText);
        if (!nextPreview) {
            return;
        }
        if (nextPreview.length >= minChars || sentenceEndPattern.test(nextPreview)) {
            flushPending();
            return;
        }
        clearTimeout(coalesceTimer);
        coalesceTimer = setTimeout(flushPending, coalesceMs);
    }

    function clear() {
        clearTimeout(timer);
        clearTimeout(coalesceTimer);
        timer = null;
        coalesceTimer = null;
        pendingText = "";
        queue = [];
        clearRender();
    }

    return { push, enqueue, clear, preview };
}
