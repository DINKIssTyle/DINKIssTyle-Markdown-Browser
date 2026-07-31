import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_EDITOR_PANE_PERCENT,
    editorPanePercentFromClientX,
    normalizeEditorPanePercent,
} from '../src/editor-pane-split.mjs';

test('normalizes editor pane percentages to the supported range', () => {
    assert.equal(normalizeEditorPanePercent(10), 20);
    assert.equal(normalizeEditorPanePercent(64.5), 64.5);
    assert.equal(normalizeEditorPanePercent(95), 80);
});

test('uses the default percentage for invalid values', () => {
    assert.equal(normalizeEditorPanePercent(null), DEFAULT_EDITOR_PANE_PERCENT);
    assert.equal(normalizeEditorPanePercent('not-a-number'), DEFAULT_EDITOR_PANE_PERCENT);
    assert.equal(editorPanePercentFromClientX(100, 0, 0), DEFAULT_EDITOR_PANE_PERCENT);
});

test('converts a pointer position into a clamped editor pane percentage', () => {
    assert.equal(editorPanePercentFromClientX(350, 100, 500), 50);
    assert.equal(editorPanePercentFromClientX(110, 100, 500), 20);
    assert.equal(editorPanePercentFromClientX(590, 100, 500), 80);
});
