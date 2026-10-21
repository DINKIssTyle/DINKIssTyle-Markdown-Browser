import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { SearchCursor } from '@codemirror/search';
import { controller } from '../test-support/controller.mjs';
import * as split from '../src/editor-pane-split.mjs';
import { createSpellcheckChunks, normalizeSpellcheckSuggestions, mergeSpellcheckSuggestions } from '../src/spellcheck-text.mjs';

function element() {
    const classes = new Set(), events = {}, attributes = new Map(), styles = new Map();
    return {
        value: '', checked: false, textContent: '', events, attributes, styles,
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
            toggle(name, on = !classes.has(name)) { on ? classes.add(name) : classes.delete(name); },
        },
        style: { setProperty: (key, value) => styles.set(key, value) },
        setAttribute: (key, value) => attributes.set(key, value),
        addEventListener: (name, callback) => { events[name] = callback; },
        removeEventListener() {}, focus() {}, blur() {}, select() {},
        click() { this.onclick?.(); },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    };
}
function searchHarness() {
    const names = ['edFindReplace', 'editorFindBar', 'editorFindInput', 'editorFindCount', 'editorFindPrev', 'editorFindNext', 'editorFindDone', 'editorFindReplaceCheck', 'editorReplaceRow', 'editorReplaceInput', 'editorReplaceOne', 'editorReplaceAll'];
    const el = Object.fromEntries(names.map(name => [name, element()]));
    const transactions = [];
    const view = {
        state: EditorState.create({ doc: 'foo bar foo' }), focus() {},
        dispatch(spec) { transactions.push(spec); this.state = this.state.update(spec).state; },
    };
    const api = controller('editor-search.js', {
        state: { isEditing: true }, el, cmView: view, SearchCursor,
        debounce: callback => callback, showToast() {},
    }, ['openFindBar', 'bindEditorSearchEvents', 'updateFindMatchesDebounced']);
    api.bindEditorSearchEvents();
    return { api, el, view, transactions };
}

test('extracted editor search navigates and replaces matches using the current document', () => {
    const h = searchHarness();
    h.api.openFindBar(true, 'foo');
    assert.equal(h.el.editorFindCount.textContent, '1 of 2');
    assert.equal(h.view.state.selection.main.from, 0);
    h.el.editorFindNext.onclick();
    assert.equal(h.view.state.selection.main.from, 8);
    h.el.editorFindPrev.onclick();
    h.el.editorReplaceInput.value = 'X';
    h.el.editorReplaceOne.onclick();
    assert.equal(h.view.state.doc.toString(), 'X bar foo');
    h.el.editorReplaceAll.onclick();
    assert.equal(h.view.state.doc.toString(), 'X bar X');
    h.el.editorFindDone.onclick();
    assert.equal(h.el.editorFindBar.classList.contains('hidden'), true);
});

test('refreshing search after a tab document change does not jump the editor scroll', () => {
    const h = searchHarness();
    h.api.openFindBar(false, 'foo');
    h.view.state = EditorState.create({ doc: 'new foo document' });
    h.api.updateFindMatchesDebounced();
    assert.equal(h.el.editorFindCount.textContent, '1 of 1');
    assert.equal(h.view.state.selection.main.from, 4);
    assert.equal(h.transactions.at(-1).scrollIntoView, false);
});

test('extracted pane layout preserves orientation, keyboard resizing and preview controls', () => {
    const el = Object.fromEntries(['editorPaneSplitter', 'documentArea', 'edSplitDirection', 'edSplitSwap', 'edPreviewToggle'].map(name => [name, element()]));
    const storage = new Map();
    const api = controller('editor-layout.js', {
        ...split, el, state: { isEditing: true }, cmView: null, isMacOS: () => false,
        document: { body: element() },
        requestAnimationFrame: callback => { callback(); return 1; },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        __import: async () => ({ updateCustomVerticalScrollbars() {} }),
    }, ['bindEditorPaneSplitter', 'toggleEditorPreview', 'setEditorPreviewVisible']);
    api.bindEditorPaneSplitter({ syncPreviewScroll() {}, hideLinkTooltip() {} });
    assert.equal(el.editorPaneSplitter.attributes.get('aria-orientation'), 'vertical');
    el.editorPaneSplitter.events.keydown({ key: 'ArrowRight', preventDefault() {} });
    assert.equal(storage.get('dkst.editor.panePercent'), '52');
    el.edSplitDirection.onclick();
    assert.equal(el.editorPaneSplitter.attributes.get('aria-orientation'), 'horizontal');
    el.editorPaneSplitter.events.keydown({ key: 'End', preventDefault() {} });
    assert.equal(storage.get('dkst.editor.verticalPanePercent'), '80');
    api.toggleEditorPreview();
    assert.equal(el.documentArea.classList.contains('editor-preview-hidden'), true);
    api.setEditorPreviewVisible(true);
    assert.equal(el.documentArea.classList.contains('editor-preview-hidden'), false);
});

test('spellcheck chunks retain exact offsets into long Korean and Markdown input', () => {
    const source = `# 제목\n\n${'문장을 검사합니다. '.repeat(180)}\n\n- 항목 하나\n- 항목 둘\n`;
    const chunks = createSpellcheckChunks(source);
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
        assert.ok(chunk.content.length <= 1000);
        assert.equal(source.slice(chunk.start, chunk.start + chunk.content.length), chunk.content);
    }
    assert.deepEqual(createSpellcheckChunks(' \n '), []);
});

test('spellcheck coordinate recovery retains the requesting tab and discards invalid suggestions', () => {
    const suggestions = normalizeSpellcheckSuggestions([
        { original: '오타', replacement: '수정', start: 0, end: 2 },
        { original: '없는말', replacement: '교체', start: 0, end: 3 },
        { original: '오타', replacement: '오타', start: 3, end: 5 },
    ], '문장 오타 끝', 10, 'background-tab');
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].start, 13);
    assert.equal(suggestions[0].end, 15);
    assert.equal(suggestions[0].tabId, 'background-tab');
    const fullText = `${' '.repeat(10)}문장 오타 끝`;
    assert.equal(mergeSpellcheckSuggestions(suggestions, suggestions, fullText).length, 1);
    assert.equal(mergeSpellcheckSuggestions([], suggestions, fullText.replace('오타', '변경')).length, 0);
});

test('shared bundled document loading uses embedded content and safe URL fallbacks', async () => {
    const embedded = controller('bundled-documents.js', {
        fetch() { assert.fail('embedded documents should not need network access'); },
    }, ['loadBundledMarkdown'], "bundledMarkdownModules['./docs/ABOUT.md'] = '# About';");
    assert.equal(await embedded.loadBundledMarkdown('/ABOUT.md'), '# About');
    const paths = [];
    const fallback = controller('bundled-documents.js', {
        fetch: async path => { paths.push(path); return { ok: path.startsWith('./'), text: async () => '# Fallback' }; },
    }, ['loadBundledMarkdown']);
    assert.equal(await fallback.loadBundledMarkdown('/HELP.md'), '# Fallback');
    assert.deepEqual(paths, ['/HELP.md', './HELP.md']);
    const missing = controller('bundled-documents.js', {
        fetch: async () => ({ ok: false }),
    }, ['loadBundledMarkdown']);
    await assert.rejects(missing.loadBundledMarkdown('/missing.md'), /Failed to load bundled markdown/);
});
