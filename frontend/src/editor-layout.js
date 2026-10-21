import { state, el, isMacOS } from './main-state.js';
import { cmView } from './editor-view.js';
import {
    DEFAULT_EDITOR_PANE_PERCENT, DEFAULT_EDITOR_SPLIT_MODE,
    editorSplitPercentFromPosition, normalizeEditorPanePercent, normalizeEditorSplitMode,
} from './editor-pane-split.mjs';

const EDITOR_PANE_PERCENT_STORAGE_KEY = 'dkst.editor.panePercent';
const EDITOR_VERTICAL_PANE_PERCENT_STORAGE_KEY = 'dkst.editor.verticalPanePercent';
const EDITOR_SPLIT_MODE_STORAGE_KEY = 'dkst.editor.splitMode';
const EDITOR_HORIZONTAL_PREVIEW_FIRST_STORAGE_KEY = 'dkst.editor.horizontalPreviewFirst';
const EDITOR_VERTICAL_PREVIEW_FIRST_STORAGE_KEY = 'dkst.editor.verticalPreviewFirst';
let setEditorPreviewVisibleFn = null;

export function bindEditorPaneSplitter({ syncPreviewScroll, hideLinkTooltip }) {
    const splitter = el.editorPaneSplitter;
    const container = el.documentArea;
    if (!splitter || !container) return;

    let splitMode = DEFAULT_EDITOR_SPLIT_MODE;
    const splitPercent = {
        horizontal: DEFAULT_EDITOR_PANE_PERCENT,
        vertical: DEFAULT_EDITOR_PANE_PERCENT,
    };
    const previewFirst = {
        horizontal: false,
        vertical: true,
    };
    let isPreviewVisible = true;
    try {
        splitMode = normalizeEditorSplitMode(localStorage.getItem(EDITOR_SPLIT_MODE_STORAGE_KEY));
        splitPercent.horizontal = normalizeEditorPanePercent(
            localStorage.getItem(EDITOR_PANE_PERCENT_STORAGE_KEY)
        );
        splitPercent.vertical = normalizeEditorPanePercent(
            localStorage.getItem(EDITOR_VERTICAL_PANE_PERCENT_STORAGE_KEY)
        );
        previewFirst.horizontal = readStoredBoolean(
            EDITOR_HORIZONTAL_PREVIEW_FIRST_STORAGE_KEY,
            false
        );
        previewFirst.vertical = readStoredBoolean(
            EDITOR_VERTICAL_PREVIEW_FIRST_STORAGE_KEY,
            true
        );
    } catch {
        // localStorage can be unavailable in restricted browser contexts.
    }

    let activePointerId = null;
    let pendingPointerPosition = null;
    let resizeFrame = 0;

    const applySplitPercent = value => {
        const percent = normalizeEditorPanePercent(value);
        splitPercent[splitMode] = percent;
        container.style.setProperty('--editor-split-position', `${percent}%`);

        const roundedPercent = Math.round(percent * 10) / 10;
        const trailingPercent = Math.round((100 - percent) * 10) / 10;
        const firstPane = previewFirst[splitMode] ? 'Preview' : 'Editor';
        const secondPane = previewFirst[splitMode] ? 'editor' : 'preview';
        splitter.setAttribute('aria-valuenow', String(roundedPercent));
        splitter.setAttribute(
            'aria-valuetext',
            `${firstPane} ${roundedPercent}%, ${secondPane} ${trailingPercent}%`
        );
        return percent;
    };

    const updateSplitControls = () => {
        const isVertical = splitMode === 'vertical';
        container.classList.toggle('editor-split-horizontal', !isVertical);
        container.classList.toggle('editor-split-vertical', isVertical);
        container.classList.toggle('editor-preview-first', previewFirst[splitMode]);
        splitter.setAttribute('aria-orientation', isVertical ? 'horizontal' : 'vertical');
        splitter.setAttribute(
            'aria-label',
            isVertical ? 'Resize preview and editor vertically' : 'Resize editor and preview horizontally'
        );

        if (el.edSplitDirectionIcon) {
            el.edSplitDirectionIcon.textContent = isVertical ? 'split_scene' : 'split_scene_2';
        }
        if (el.edSplitDirection) {
            const directionTitle = isVertical ? 'Switch to Horizontal Split' : 'Switch to Vertical Split';
            el.edSplitDirection.title = directionTitle;
            el.edSplitDirection.setAttribute('aria-label', directionTitle);
        }
        if (el.edSplitSwapIcon) {
            el.edSplitSwapIcon.textContent = isVertical ? 'swap_vert' : 'swap_horiz';
        }
        if (el.edSplitSwap) {
            const swapTitle = isVertical
                ? 'Swap Top and Bottom Panes'
                : 'Swap Left and Right Panes';
            el.edSplitSwap.title = swapTitle;
            el.edSplitSwap.setAttribute('aria-label', swapTitle);
        }

        applySplitPercent(splitPercent[splitMode]);

        if (cmView) {
            requestAnimationFrame(() => {
                cmView.requestMeasure();
                syncPreviewScroll(cmView);
                import('./main-settings.js').then(({ updateCustomVerticalScrollbars }) => {
                    updateCustomVerticalScrollbars();
                }).catch(() => {});
            });
        }
    };

    const updatePreviewToggle = () => {
        container.classList.toggle('editor-preview-hidden', !isPreviewVisible);
        el.edPreviewToggle?.classList.toggle('preview-off', !isPreviewVisible);
        if (el.edPreviewToggleIcon) {
            el.edPreviewToggleIcon.textContent = isPreviewVisible ? 'preview' : 'preview_off';
        }
        if (el.edPreviewToggle) {
            const previewAction = isPreviewVisible ? 'Hide Preview' : 'Show Preview';
            const previewTitle = `${previewAction} (${isMacOS() ? '⌘G' : 'Ctrl+G'})`;
            el.edPreviewToggle.title = previewTitle;
            el.edPreviewToggle.setAttribute('aria-label', previewAction);
            el.edPreviewToggle.setAttribute('aria-pressed', String(isPreviewVisible));
        }
        if (!isPreviewVisible && el.contentViewScrollbar) {
            el.contentViewScrollbar.classList.remove('is-overflowing', 'is-active');
        }
        requestAnimationFrame(() => {
            cmView?.requestMeasure();
            import('./main-settings.js').then(({ updateCustomVerticalScrollbars }) => {
                updateCustomVerticalScrollbars();
            }).catch(() => {});
        });
    };

    updateSplitControls();
    updatePreviewToggle();
    setEditorPreviewVisibleFn = (visible) => {
        if (isPreviewVisible === visible) return;
        isPreviewVisible = visible;
        updatePreviewToggle();
    };

    const positionTooltip = event => {
        const tooltip = el.linkTooltip;
        if (!tooltip || tooltip.classList.contains('hidden')) return;

        const padding = 8;
        const gap = 12;
        const tooltipRect = tooltip.getBoundingClientRect();
        const left = Math.min(
            Math.max(padding, event.clientX - (tooltipRect.width / 2)),
            window.innerWidth - tooltipRect.width - padding
        );
        let top = event.clientY - tooltipRect.height - gap;
        if (top < padding) {
            top = Math.min(event.clientY + gap, window.innerHeight - tooltipRect.height - padding);
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    };

    const showTooltip = event => {
        if (!el.linkTooltip || activePointerId !== null) return;
        hideLinkTooltip();
        const resizeArrow = splitMode === 'vertical' ? '↕' : '↔';
        el.linkTooltip.innerHTML = `${resizeArrow} Drag to resize<br>Double-click: Reset`;
        el.linkTooltip.classList.remove('hidden');
        positionTooltip(event);
    };

    const updateFromPointer = pointer => {
        const bounds = container.getBoundingClientRect();
        const isVertical = splitMode === 'vertical';
        const pointerPosition = isVertical ? pointer.clientY : pointer.clientX;
        const containerStart = isVertical ? bounds.top : bounds.left;
        const containerSize = isVertical ? bounds.height : bounds.width;
        applySplitPercent(editorSplitPercentFromPosition(
            pointerPosition,
            containerStart,
            containerSize
        ));
    };

    const flushPendingResize = () => {
        resizeFrame = 0;
        if (!pendingPointerPosition) return;
        updateFromPointer(pendingPointerPosition);
        pendingPointerPosition = null;
    };

    const finishResize = event => {
        if (activePointerId === null || event.pointerId !== activePointerId) return;
        if (resizeFrame) {
            cancelAnimationFrame(resizeFrame);
            resizeFrame = 0;
        }
        if (pendingPointerPosition) {
            updateFromPointer(pendingPointerPosition);
            pendingPointerPosition = null;
        }
        activePointerId = null;
        document.body.classList.remove(
            'editor-split-is-resizing-horizontal',
            'editor-split-is-resizing-vertical'
        );
        splitter.classList.remove('is-resizing');
        splitter.blur();
        persistEditorSplitPercent(splitMode, splitPercent[splitMode]);
        requestAnimationFrame(() => {
            cmView?.requestMeasure();
            if (cmView) {
                syncPreviewScroll(cmView);
            }
            import('./main-settings.js').then(({ updateCustomVerticalScrollbars }) => {
                updateCustomVerticalScrollbars();
            }).catch(() => {});
        });
    };

    splitter.addEventListener('pointerdown', event => {
        if (event.button !== 0 || activePointerId !== null) return;
        hideLinkTooltip();
        activePointerId = event.pointerId;
        splitter.setPointerCapture?.(event.pointerId);
        document.body.classList.add(`editor-split-is-resizing-${splitMode}`);
        splitter.classList.add('is-resizing');
        updateFromPointer(event);
        event.preventDefault();
    });

    splitter.addEventListener('pointermove', event => {
        if (activePointerId === null) {
            positionTooltip(event);
            return;
        }
        if (event.pointerId !== activePointerId) return;
        pendingPointerPosition = { clientX: event.clientX, clientY: event.clientY };
        if (!resizeFrame) {
            resizeFrame = requestAnimationFrame(flushPendingResize);
        }
    });
    splitter.addEventListener('pointerup', finishResize);
    splitter.addEventListener('pointercancel', finishResize);
    splitter.addEventListener('pointerenter', showTooltip);
    splitter.addEventListener('pointerleave', hideLinkTooltip);
    splitter.addEventListener('lostpointercapture', event => {
        if (event.pointerId === activePointerId) finishResize(event);
    });

    splitter.addEventListener('dblclick', () => {
        applySplitPercent(DEFAULT_EDITOR_PANE_PERCENT);
        persistEditorSplitPercent(splitMode, DEFAULT_EDITOR_PANE_PERCENT);
        requestAnimationFrame(() => {
            cmView?.requestMeasure();
            if (cmView) {
                syncPreviewScroll(cmView);
            }
            import('./main-settings.js').then(({ updateCustomVerticalScrollbars }) => {
                updateCustomVerticalScrollbars();
            }).catch(() => {});
        });
    });

    splitter.addEventListener('keydown', event => {
        const currentPercent = splitPercent[splitMode];
        const step = event.shiftKey ? 10 : 2;
        let nextPercent = null;
        if (splitMode === 'horizontal' && event.key === 'ArrowLeft') nextPercent = currentPercent - step;
        if (splitMode === 'horizontal' && event.key === 'ArrowRight') nextPercent = currentPercent + step;
        if (splitMode === 'vertical' && event.key === 'ArrowUp') nextPercent = currentPercent - step;
        if (splitMode === 'vertical' && event.key === 'ArrowDown') nextPercent = currentPercent + step;
        if (event.key === 'Home') nextPercent = 20;
        if (event.key === 'End') nextPercent = 80;
        if (nextPercent === null) return;

        const normalizedPercent = applySplitPercent(nextPercent);
        persistEditorSplitPercent(splitMode, normalizedPercent);
        event.preventDefault();
    });

    if (el.edSplitDirection) {
        el.edSplitDirection.onclick = () => {
            hideLinkTooltip();
            splitMode = splitMode === 'horizontal' ? 'vertical' : 'horizontal';
            updateSplitControls();
            persistEditorSplitMode(splitMode);
        };
    }
    if (el.edSplitSwap) {
        el.edSplitSwap.onclick = () => {
            hideLinkTooltip();
            previewFirst[splitMode] = !previewFirst[splitMode];
            updateSplitControls();
            persistEditorPreviewFirst(splitMode, previewFirst[splitMode]);
        };
    }
    if (el.edPreviewToggle) {
        el.edPreviewToggle.onclick = () => {
            hideLinkTooltip();
            isPreviewVisible = !isPreviewVisible;
            updatePreviewToggle();
        };
    }
}

export function toggleEditorPreview() {
    if (!state.isEditing || !el.edPreviewToggle) return false;
    el.edPreviewToggle.click();
    return true;
}

export function setEditorPreviewVisible(visible) {
    if (typeof setEditorPreviewVisibleFn === 'function') {
        setEditorPreviewVisibleFn(visible);
        return true;
    }
    const container = el.documentArea;
    if (container) {
        container.classList.toggle('editor-preview-hidden', !visible);
    }
    return false;
}

function readStoredBoolean(key, fallback) {
    const storedValue = localStorage.getItem(key);
    if (storedValue === 'true') return true;
    if (storedValue === 'false') return false;
    return fallback;
}

function persistEditorSplitMode(mode) {
    persistEditorSplitSetting(EDITOR_SPLIT_MODE_STORAGE_KEY, normalizeEditorSplitMode(mode));
}

function persistEditorSplitPercent(mode, value) {
    const storageKey = mode === 'vertical'
        ? EDITOR_VERTICAL_PANE_PERCENT_STORAGE_KEY
        : EDITOR_PANE_PERCENT_STORAGE_KEY;
    persistEditorSplitSetting(storageKey, normalizeEditorPanePercent(value));
}

function persistEditorPreviewFirst(mode, value) {
    const storageKey = mode === 'vertical'
        ? EDITOR_VERTICAL_PREVIEW_FIRST_STORAGE_KEY
        : EDITOR_HORIZONTAL_PREVIEW_FIRST_STORAGE_KEY;
    persistEditorSplitSetting(storageKey, !!value);
}

function persistEditorSplitSetting(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Keep the current layout even when persistence is unavailable.
    }
}

