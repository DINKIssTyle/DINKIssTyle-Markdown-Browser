export const DEFAULT_EDITOR_PANE_PERCENT = 50;
export const MIN_EDITOR_PANE_PERCENT = 20;
export const MAX_EDITOR_PANE_PERCENT = 80;
export const DEFAULT_EDITOR_SPLIT_MODE = 'horizontal';
export const EDITOR_SPLIT_MODES = Object.freeze(['horizontal', 'vertical']);

export function normalizeEditorPanePercent(value, fallback = DEFAULT_EDITOR_PANE_PERCENT) {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return fallback;
    }
    return Math.min(MAX_EDITOR_PANE_PERCENT, Math.max(MIN_EDITOR_PANE_PERCENT, numericValue));
}

export function normalizeEditorSplitMode(value) {
    return EDITOR_SPLIT_MODES.includes(value) ? value : DEFAULT_EDITOR_SPLIT_MODE;
}

export function editorSplitPercentFromPosition(pointerPosition, containerStart, containerSize) {
    if (!Number.isFinite(containerSize) || containerSize <= 0) {
        return DEFAULT_EDITOR_PANE_PERCENT;
    }
    return normalizeEditorPanePercent(((pointerPosition - containerStart) / containerSize) * 100);
}
