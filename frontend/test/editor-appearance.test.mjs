import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { state, el } from '../src/main-state.js';
import { setEditorView } from '../src/editor-view.js';
import {
    themeCompartment, tokenColorCompartment, getEditorDefaultTokenColors,
    normalizeTokenColors, applyEditorTokenColors, applyEditorBackgroundColor, setEditorTheme,
} from '../src/editor-appearance.js';

test('extracted appearance keeps accent defaults, token extensions and editor background in sync', t => {
    const oldDocument = globalThis.document, oldComputedStyle = globalThis.getComputedStyle, oldEditorElement = el.editorView;
    const oldState = { ...state };
    t.after(() => {
        globalThis.document = oldDocument;
        globalThis.getComputedStyle = oldComputedStyle;
        el.editorView = oldEditorElement;
        Object.assign(state, oldState);
        setEditorView(null);
    });
    let dark = false;
    const styles = new Map();
    globalThis.document = { documentElement: { classList: { contains: () => dark } } };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
    el.editorView = { style: { setProperty: (key, value) => styles.set(key, value) } };
    const view = {
        state: EditorState.create({ extensions: [themeCompartment.of([]), tokenColorCompartment.of([])] }),
        dispatch(spec) { this.state = this.state.update(spec).state; },
    };
    setEditorView(view);
    assert.equal(getEditorDefaultTokenColors('light').link, '#123456');
    assert.equal(normalizeTokenColors({ plain: 'invalid' }).plain, '#1f2937');
    state.editorTokenColorsEnabled = true;
    state.editorTokenColors = { plain: '#112233' };
    state.editorBackgroundColor = '#ffffff';
    applyEditorTokenColors();
    applyEditorBackgroundColor();
    assert.equal(styles.get('--editor-plain-text-color'), '#112233');
    assert.equal(styles.get('--editor-background-color'), '#ffffff');
    assert.ok(tokenColorCompartment.get(view.state).length > 0);
    state.editorTokenColorsEnabled = false;
    applyEditorTokenColors();
    assert.deepEqual(tokenColorCompartment.get(view.state), []);
    dark = true;
    state.editorTokenColors = {};
    state.editorBackgroundColor = undefined;
    setEditorTheme(true);
    assert.equal(styles.get('--editor-background-color'), '#1f2937');
    assert.equal(styles.get('--editor-plain-text-color'), '#e5e7eb');
});
