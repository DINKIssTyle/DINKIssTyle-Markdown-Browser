import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionSynchronizer } from '../src/session-sync.mjs';

function harness(send) {
    const state = {
        activeTabId: 'a', tabs: [{ id: 'a', title: 'A', path: '/a.md' }],
        isEditing: true, currentFilePath: '/a.md', currentMarkdownSource: 'changed', editorOriginalContent: 'original',
    };
    const calls = [], errors = [];
    const sync = createSessionSynchronizer({
        getState: () => state, initialRevision: 10,
        sendSessions: (revision, sessions) => { calls.push({ revision, sessions }); return send?.(); },
        onError: error => errors.push(error),
    });
    return { state, sync, calls, errors };
}

test('unchanged snapshots are not sent and new edits advance the revision', async () => {
    const h = harness();
    await h.sync();
    await h.sync();
    h.state.currentMarkdownSource = 'newer edit';
    await h.sync();
    assert.deepEqual(h.calls.map(c => c.revision), [11, 12]);
    assert.equal(h.calls[1].sessions[0].Content, 'newer edit');
});

test('saving or closing the last dirty document sends an empty snapshot', async () => {
    const h = harness();
    await h.sync();
    h.state.editorOriginalContent = h.state.currentMarkdownSource;
    await h.sync();
    assert.deepEqual(h.calls[1].sessions, []);
    h.state.currentMarkdownSource = 'more edits';
    await h.sync();
    h.state.tabs = [];
    await h.sync();
    assert.deepEqual(h.calls[3].sessions, []);
});

test('failed delivery can be retried without changing the document', async () => {
    let fail = true;
    const h = harness(() => { if (fail) return Promise.reject(new Error('offline')); });
    await h.sync();
    fail = false;
    await h.sync();
    assert.equal(h.errors.length, 1);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].revision, 12);
});

test('an older failure cannot invalidate a newer successful snapshot', async () => {
    let rejectFirst, count = 0;
    const h = harness(() => ++count === 1 ? new Promise((_, reject) => { rejectFirst = reject; }) : undefined);
    const first = h.sync();
    h.state.currentMarkdownSource = 'newer edit';
    await h.sync();
    rejectFirst(new Error('old failure'));
    await first;
    await h.sync();
    assert.equal(h.calls.length, 2);
});

test('synchronous transport errors are reported and remain retryable', async () => {
    const h = harness(() => { throw new Error('bridge unavailable'); });
    await h.sync();
    await h.sync();
    assert.equal(h.errors.length, 2);
    assert.equal(h.calls.length, 2);
});
