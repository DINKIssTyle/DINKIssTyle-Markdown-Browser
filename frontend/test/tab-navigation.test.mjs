import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the actual controllers with native I/O and rendering replaced by
// controllable promises, so races can be tested without a WebView.
function controller(file, globals, exports, overrides = '') {
    const source = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
        .replace(/^import\s[\s\S]*?;\n/gm, '')
        .replace(/^export /gm, '')
        .replace(/import\.meta\.glob\([^;]+\)/g, '{}')
        .replace(/\bimport\(/g, '__import(');
    const context = vm.createContext({ console, setTimeout, clearTimeout, ...globals });
    return vm.runInContext(`${source}\n${overrides}\n;({${exports.join(',')}})`, context);
}
function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}
function tab(id) { return { id, path: `/${id}.md`, title: id, navHistory: [{ path: `/${id}.md`, scroll: 0 }], navIndex: 0, currentMarkdownSource: id, isEditing: false }; }
function navigation() {
    const a = tab('a'), b = tab('b');
    const state = { tabs: [a, b], activeTabId: 'a', currentFilePath: a.path, currentMarkdownSource: 'a', navHistory: a.navHistory, navIndex: 0, isEditing: false };
    const reads = new Map();
    const recent = deferred();
    const api = controller('main-navigation.js', {
        state, HOME_SCREEN_PATH: '__home__', normalizeFileURLPath: p => p, hideLinkTooltip() {},
        getActiveTab: () => state.tabs.find(t => t.id === state.activeTabId),
        syncTabFromGlobals(t) { Object.assign(t, { path: state.currentFilePath, currentMarkdownSource: state.currentMarkdownSource, navHistory: state.navHistory, navIndex: state.navIndex }); },
        renderTabs() {}, renderActiveTab: async () => {}, switchToTab: async id => { state.activeTabId = id; },
        isProgressTaskActive: () => true, beginProgressTask: () => 1, updateProgress() {}, finishProgressTask() {}, throwIfTaskCancelled() {}, isCancelledTaskError: () => false,
        documentTypeFromPath: () => 'markdown', kindFromPath: () => 'document', isEditableDocumentType: () => true,
        isBundledDocumentPath: () => false, isMobileUntitledPath: () => false, isSupportedPreviewPath: () => true,
        getPathDirname: () => '/', deriveTabTitle: p => p, syncEngineSelector() {},
        getScroller: () => ({ scrollTop: 0 }), saveCurrentScroll() {}, TouchRecentFile: () => recent.promise,
        ReadFile: path => { const read = deferred(); reads.set(path, read); return read.promise; },
        __import: async () => ({ yieldToUI: async () => {} }), LogError: message => assert.fail(message), showToast() {},
    }, ['loadFile', 'openPath', 'reloadCurrent', 'applyReloadedContent']);
    function activateB() {
        state.activeTabId = b.id;
        state.currentFilePath = b.path;
        state.currentMarkdownSource = b.currentMarkdownSource;
        state.navHistory = b.navHistory;
        state.navIndex = b.navIndex;
    }
    return { api, state, a, b, reads, recent, activateB };
}

test('switching tabs while recent-file I/O is pending never copies B into A', async () => {
    const h = navigation();
    const pending = h.api.loadFile('/new.md', 'new content', true, true, h.a);
    h.activateB();
    h.recent.resolve();
    await pending;
    assert.equal(h.a.path, '/new.md');
    assert.equal(h.a.currentMarkdownSource, 'new content');
    assert.equal(h.b.path, '/b.md');
    assert.equal(h.state.currentMarkdownSource, 'b');
    assert.deepEqual(Array.from(h.b.navHistory, e => e.path), ['/b.md']);
});
test('a newer home request prevents a slow read from reopening the old document', async () => {
    const h = navigation();
    const pending = h.api.openPath('/slow.md');
    await h.api.openPath('__home__', { pushHistory: false });
    h.reads.get('/slow.md').resolve('old result');
    await pending;
    assert.equal(h.a.path, '__home__');
    assert.equal(h.state.currentMarkdownSource, '');
});
test('a closed tab never receives a late file result', async () => {
    const h = navigation();
    const pending = h.api.openPath('/slow.md');
    h.state.tabs.shift();
    h.activateB();
    h.reads.get('/slow.md').resolve('old result');
    await pending;
    assert.equal(h.b.currentMarkdownSource, 'b');
    assert.equal(h.a.path, '/a.md');
});
test('a refresh completing after navigation cannot replace the new document', async () => {
    const h = navigation();
    const pending = h.api.reloadCurrent();
    await h.api.openPath('__home__', { pushHistory: false });
    h.reads.get('/a.md').resolve('stale refresh');
    await pending;
    assert.equal(h.state.currentMarkdownSource, '');
});
function tabsController(state, extra = {}) {
    const animation = deferred();
    const api = controller('main-tabs.js', {
        state, HOME_SCREEN_PATH: '__home__', hasUnsavedEditorChanges: () => false, hasUnsavedTabChanges: () => false,
        clearTransientEditorOverlays() {}, syncEditorSessionFromState() {}, __animateTabClose: () => animation.promise,
        __renderTabs() {}, __renderActiveTab: async () => {}, __syncGlobalsFromTab(t) { state.currentFilePath = t.path; }, ...extra,
    }, ['closeTab'], 'animateTabClose = __animateTabClose; renderTabs = __renderTabs; renderActiveTab = __renderActiveTab; syncGlobalsFromTab = __syncGlobalsFromTab;');
    return { ...api, animation };
}
test('closing A preserves C selected during its close animation', async () => {
    const state = { tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'a', isEditing: false };
    const h = tabsController(state);
    const pending = h.closeTab('a');
    state.activeTabId = 'c';
    h.animation.resolve();
    await pending;
    assert.equal(state.activeTabId, 'c');
    assert.deepEqual(state.tabs.map(t => t.id), ['b', 'c']);
});
test('closing a background tab activated during the animation selects a live fallback', async () => {
    const state = { tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'c', isEditing: false };
    const h = tabsController(state);
    const pending = h.closeTab('b');
    state.activeTabId = 'b';
    h.animation.resolve();
    await pending;
    assert.ok(state.tabs.some(t => t.id === state.activeTabId));
});
test('repeated close requests share one save prompt; cancellation releases the guard', async () => {
    const state = { tabs: [{ ...tab('a'), isEditing: true }, tab('b')], activeTabId: 'b', isEditing: false };
    let prompts = 0;
    const decision = deferred();
    const h = tabsController(state, { hasUnsavedTabChanges: () => true, formatSaveDialogMessage: () => '', AskSaveDiscardCancel: () => { prompts++; return decision.promise; } });
    const pending = h.closeTab('a');
    await h.closeTab('a');
    assert.equal(prompts, 1);
    decision.resolve('Cancel');
    await pending;
    await h.closeTab('a');
    assert.equal(prompts, 2);
    assert.equal(state.tabs.length, 2);
});

test('two file reads completing out of order keep the newest document', async () => {
    const h = navigation();
    h.recent.resolve();
    const first = h.api.openPath('/first.md');
    const second = h.api.openPath('/second.md');
    h.reads.get('/second.md').resolve('second');
    await second;
    h.reads.get('/first.md').resolve('first');
    await first;
    assert.equal(h.state.currentFilePath, '/second.md');
    assert.equal(h.a.currentMarkdownSource, 'second');
});

test('starting an editor while a file read is pending preserves the new edits', async () => {
    const h = navigation();
    const pending = h.api.openPath('/slow.md');
    h.state.isEditing = true;
    h.state.currentMarkdownSource = 'new unsaved work';
    h.reads.get('/slow.md').resolve('disk content');
    await pending;
    assert.equal(h.state.currentMarkdownSource, 'new unsaved work');
    assert.equal(h.state.currentFilePath, '/a.md');
});

test('refresh does not replace an editor buffer', async () => {
    const h = navigation();
    h.state.isEditing = true;
    h.state.currentMarkdownSource = 'unsaved work';
    await h.api.reloadCurrent();
    assert.equal(h.reads.size, 0);
    assert.equal(h.state.currentMarkdownSource, 'unsaved work');
});

test('saving while typing preserves the newer buffer and stays in edit mode', async () => {
    const source = fs.readFileSync(new URL('../src/main-editor.js', import.meta.url), 'utf8');
    const save = source.slice(source.indexOf('export async function saveCurrentDocument('), source.indexOf('export async function saveCurrentDocumentAs(')).replace('export ', '');
    const a = { ...tab('a'), isEditing: true, editorOriginalContent: 'original' };
    const state = { tabs: [a], activeTabId: 'a', isEditing: true, currentFilePath: '/a.md', currentMarkdownSource: 'snapshot', editorOriginalContent: 'original' };
    let buffer = 'snapshot', exited = false;
    const write = deferred();
    const context = vm.createContext({
        state, cmView: { state: { doc: { toString: () => buffer } } }, getActiveTab: () => a,
        formatSaveDialogMessage: () => '', isMobilePlatform: () => false, SaveFile: (path, content) => { assert.equal(path, '/a.md'); assert.equal(content, 'snapshot'); return write.promise; },
        showToast() {}, deriveTabTitle: () => 'a', getCurrentEditorText: () => buffer, getPathDirname: () => '/', syncEditorStateToBackend() {}, renderTabs() {},
        hasUnsavedEditorChanges: () => buffer !== state.editorOriginalContent,
        exitEditMode: async () => { exited = true; }, LogError: message => assert.fail(message),
    });
    const saving = vm.runInContext(`${save};saveCurrentDocument({confirm:false})`, context);
    buffer = 'typed during save';
    state.currentMarkdownSource = a.currentMarkdownSource = buffer;
    write.resolve();
    assert.equal(await saving, true);
    assert.equal(state.currentMarkdownSource, buffer);
    assert.equal(a.currentMarkdownSource, buffer);
    assert.equal(state.editorOriginalContent, 'snapshot');
    assert.equal(exited, false);
});

test('a new progress task leaves background loads running; explicit cancel stops only its task', async () => {
    const source = fs.readFileSync(new URL('../src/main-ui.js', import.meta.url), 'utf8');
    const functions = source.slice(source.indexOf('export function beginProgressTask('), source.indexOf('export function isCancelledTaskError(')).replace(/^export /gm, '').replace(/\bimport\(/g, '__import(');
    const context = vm.createContext({
        showProgress() {}, updateProgress() {}, hideProgress() {},
        createCancelledTaskError: () => new Error('cancelled'), __import: async () => ({ cleanupHTMLFrame() {} }),
    });
    const api = vm.runInContext(`let activeProgressTaskId=0; const cancelledProgressTaskIds=new Set(); ${functions}; ({beginProgressTask,throwIfTaskCancelled,cancelProgressTask,finishProgressTask})`, context);
    const a = api.beginProgressTask('A'), b = api.beginProgressTask('B');
    assert.doesNotThrow(() => api.throwIfTaskCancelled(a));
    api.cancelProgressTask(b);
    assert.throws(() => api.throwIfTaskCancelled(b), /cancelled/);
    assert.doesNotThrow(() => api.throwIfTaskCancelled(a));
    api.finishProgressTask(a);
    api.finishProgressTask(b);
});

test('an old refresh cannot overwrite a newer read of the same path', async () => {
    const h = navigation();
    h.recent.resolve();
    const refresh = h.api.reloadCurrent();
    const oldRead = h.reads.get('/a.md');
    const newer = h.api.openPath('/a.md', { pushHistory: false });
    h.reads.get('/a.md').resolve('newer document');
    await newer;
    oldRead.resolve('old refresh');
    await refresh;
    assert.equal(h.state.currentMarkdownSource, 'newer document');
});

test('each tab receives its own overlapping load result', async () => {
    const h = navigation();
    h.recent.resolve();
    const first = h.api.openPath('/first.md');
    h.activateB();
    const second = h.api.openPath('/second.md');
    h.reads.get('/second.md').resolve('second document');
    await second;
    h.reads.get('/first.md').resolve('first document');
    await first;
    assert.equal(h.a.path, '/first.md');
    assert.equal(h.a.currentMarkdownSource, 'first document');
    assert.equal(h.b.path, '/second.md');
    assert.equal(h.state.currentMarkdownSource, 'second document');
});
