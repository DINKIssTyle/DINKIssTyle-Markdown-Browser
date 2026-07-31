import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_EDITOR_PANE_PERCENT,
    DEFAULT_EDITOR_SPLIT_MODE,
    editorSplitPercentFromPosition,
    normalizeEditorPanePercent,
    normalizeEditorSplitMode,
} from '../src/editor-pane-split.mjs';

test('normalizes editor pane percentages to the supported range', () => {
    assert.equal(normalizeEditorPanePercent(10), 20);
    assert.equal(normalizeEditorPanePercent(64.5), 64.5);
    assert.equal(normalizeEditorPanePercent(95), 80);
});

test('uses the default percentage for invalid values', () => {
    assert.equal(normalizeEditorPanePercent(null), DEFAULT_EDITOR_PANE_PERCENT);
    assert.equal(normalizeEditorPanePercent('not-a-number'), DEFAULT_EDITOR_PANE_PERCENT);
    assert.equal(editorSplitPercentFromPosition(100, 0, 0), DEFAULT_EDITOR_PANE_PERCENT);
});

test('converts a pointer position into a clamped editor pane percentage', () => {
    assert.equal(editorSplitPercentFromPosition(350, 100, 500), 50);
    assert.equal(editorSplitPercentFromPosition(110, 100, 500), 20);
    assert.equal(editorSplitPercentFromPosition(590, 100, 500), 80);
});

test('normalizes persisted split modes', () => {
    assert.equal(normalizeEditorSplitMode('horizontal'), 'horizontal');
    assert.equal(normalizeEditorSplitMode('vertical'), 'vertical');
    assert.equal(normalizeEditorSplitMode('diagonal'), DEFAULT_EDITOR_SPLIT_MODE);
});
