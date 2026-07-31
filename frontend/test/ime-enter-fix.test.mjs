import test from 'node:test';
import assert from 'node:assert/strict';

import {
    KOREAN_IME_ENTER_WINDOW_MS,
    normalizeKoreanImeLineBreak,
} from '../src/ime-enter-fix.mjs';

const baseInput = {
    enabled: true,
    text: '\n\n',
    composing: false,
    justEndedAt: 1_000,
    now: 1_001,
};

test('normalizes WebKit single-Enter DOM text after composition', () => {
    assert.equal(normalizeKoreanImeLineBreak(baseInput), '\n');
});

test('normalizes the same DOM text while composition is still active', () => {
    assert.equal(normalizeKoreanImeLineBreak({
        ...baseInput,
        composing: true,
        justEndedAt: 0,
    }), '\n');
});

test('does not consume an already-correct single line break', () => {
    assert.equal(normalizeKoreanImeLineBreak({
        ...baseInput,
        text: '\n',
    }), null);
});

test('does not modify unrelated multiline input', () => {
    assert.equal(normalizeKoreanImeLineBreak({
        ...baseInput,
        text: 'first\n\nsecond',
    }), null);
});

test('does not modify input outside the post-composition window', () => {
    assert.equal(normalizeKoreanImeLineBreak({
        ...baseInput,
        now: baseInput.justEndedAt + KOREAN_IME_ENTER_WINDOW_MS,
    }), null);
});

test('does not modify input when the compatibility setting is disabled', () => {
    assert.equal(normalizeKoreanImeLineBreak({
        ...baseInput,
        enabled: false,
    }), null);
});
