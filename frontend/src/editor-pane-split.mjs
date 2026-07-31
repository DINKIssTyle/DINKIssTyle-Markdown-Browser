export const DEFAULT_EDITOR_PANE_PERCENT = 50;
export const MIN_EDITOR_PANE_PERCENT = 20;
export const MAX_EDITOR_PANE_PERCENT = 80;

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

export function editorPanePercentFromClientX(clientX, containerLeft, containerWidth) {
    if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
        return DEFAULT_EDITOR_PANE_PERCENT;
    }
    return normalizeEditorPanePercent(((clientX - containerLeft) / containerWidth) * 100);
}
