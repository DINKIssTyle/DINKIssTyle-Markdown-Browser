import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isImeKeyboardEvent,
    KOREAN_IME_ENTER_WINDOW_MS,
    normalizeKoreanImeLineBreak,
    shouldMoveSlashSelectionAfterImeCommit,
    shouldRunSlashCommandAfterImeCommit,
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

const slashCommandInput = {
    enabled: true,
    key: 'Enter',
    composing: true,
    hasMenu: true,
    hasCommand: true,
};

test('runs a selected slash command when Enter commits an IME composition', () => {
    assert.equal(shouldRunSlashCommandAfterImeCommit(slashCommandInput), true);
});

test('does not run slash commands for a regular Enter', () => {
    assert.equal(shouldRunSlashCommandAfterImeCommit({
        ...slashCommandInput,
        composing: false,
    }), false);
    assert.equal(shouldRunSlashCommandAfterImeCommit({
        ...slashCommandInput,
        key: 'ArrowDown',
    }), false);
});

test('does not run slash commands when the compatibility setting is disabled', () => {
    assert.equal(shouldRunSlashCommandAfterImeCommit({
        ...slashCommandInput,
        enabled: false,
    }), false);
});

test('requires both a visible menu and a selected command', () => {
    assert.equal(shouldRunSlashCommandAfterImeCommit({
        ...slashCommandInput,
        hasMenu: false,
    }), false);
    assert.equal(shouldRunSlashCommandAfterImeCommit({
        ...slashCommandInput,
        hasCommand: false,
    }), false);
});

test('moves slash-menu selection when an arrow key commits IME text', () => {
    assert.equal(shouldMoveSlashSelectionAfterImeCommit({
        ...slashCommandInput,
        key: 'ArrowDown',
    }), true);
    assert.equal(shouldMoveSlashSelectionAfterImeCommit({
        ...slashCommandInput,
        key: 'ArrowUp',
    }), true);
});

test('does not capture slash-menu arrow keys outside the CJK fix', () => {
    assert.equal(shouldMoveSlashSelectionAfterImeCommit({
        ...slashCommandInput,
        key: 'ArrowDown',
        enabled: false,
    }), false);
    assert.equal(shouldMoveSlashSelectionAfterImeCommit({
        ...slashCommandInput,
        key: 'ArrowDown',
        composing: false,
    }), false);
});

test('recognizes IME key events before CodeMirror processes composition state', () => {
    assert.equal(isImeKeyboardEvent({ eventIsComposing: true }), true);
    assert.equal(isImeKeyboardEvent({ keyCode: 229 }), true);
    assert.equal(isImeKeyboardEvent({ codeMirrorCompositionStarted: true }), true);
    assert.equal(isImeKeyboardEvent({ observedComposing: true }), true);
});

test('recognizes a key emitted immediately after compositionend', () => {
    assert.equal(isImeKeyboardEvent({
        justEndedAt: 1_000,
        now: 1_012,
    }), true);
});

test('does not capture keys outside the post-composition window', () => {
    assert.equal(isImeKeyboardEvent({
        justEndedAt: 1_000,
        now: 1_000 + KOREAN_IME_ENTER_WINDOW_MS,
    }), false);
});

test('does not classify a normal keyboard event as IME composition', () => {
    assert.equal(isImeKeyboardEvent({
        eventIsComposing: false,
        keyCode: 13,
        codeMirrorComposing: false,
        codeMirrorCompositionStarted: false,
        observedComposing: false,
    }), false);
});
