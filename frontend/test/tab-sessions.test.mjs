import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUnsavedSessions } from '../src/tab-sessions.mjs';
const dirtyTab = (id, content) => ({ id, path: `/${id}.md`, title: id, isEditing: true, currentMarkdownSource: content, editorOriginalContent: 'original' });
test('quit snapshot includes dirty background tabs when the active tab is clean', () => {
    const state = { tabs: [dirtyTab('a', 'edited A'), dirtyTab('b', 'original')], activeTabId: 'b', isEditing: true, currentFilePath: '/b.md', currentMarkdownSource: 'original', editorOriginalContent: 'original' };
    assert.deepEqual(collectUnsavedSessions(state).map(s => [s.TabID, s.Content, s.CurrentPath]), [['a', 'edited A', '/a.md']]);
});
test('quit snapshot uses current active edits and the source path of an editing preview', () => {
    const state = { tabs: [dirtyTab('a', 'stale A'), dirtyTab('b', 'edited B')], activeTabId: 'a', isEditing: true, currentFilePath: '/preview.md', editingSourcePath: '/source.md', currentMarkdownSource: 'latest A', editorOriginalContent: 'original' };
    assert.deepEqual(collectUnsavedSessions(state).map(s => [s.TabID, s.Content, s.CurrentPath]), [['a', 'latest A', '/source.md'], ['b', 'edited B', '/b.md']]);
});
test('switching to a viewer preserves background changes and closing it removes them', () => {
    const state = { tabs: [dirtyTab('a', 'edited A'), { id: 'home' }], activeTabId: 'home', isEditing: false };
    assert.equal(collectUnsavedSessions(state).length, 1);
    state.tabs.shift();
    assert.deepEqual(collectUnsavedSessions(state), []);
});
