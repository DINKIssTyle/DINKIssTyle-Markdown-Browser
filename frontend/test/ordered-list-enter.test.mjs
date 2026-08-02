import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getDeferredStandardOrderedListMarker,
    getStandardOrderedListEnterEdit,
} from '../src/ordered-list-enter.mjs';

test('continues a standard ordered list after Korean text', () => {
    const edit = getStandardOrderedListEnterEdit('1. 한글', 5);
    assert.deepEqual(edit, {
        fromOffset: 5,
        toOffset: 5,
        insert: '\n1. ',
        cursorOffset: 9,
    });
    assert.equal(getDeferredStandardOrderedListMarker(edit, '\n'), '1. ');
});

test('preserves indentation, delimiter, and marker spacing', () => {
    assert.deepEqual(getStandardOrderedListEnterEdit('  42)  항목', 8), {
        fromOffset: 8,
        toOffset: 8,
        insert: '\n  1)  ',
        cursorOffset: 15,
    });
});

test('removes the marker when leaving an empty ordered-list item', () => {
    const edit = getStandardOrderedListEnterEdit('  1. ', 5);
    assert.deepEqual(edit, {
        fromOffset: 2,
        toOffset: 5,
        insert: '',
        cursorOffset: 2,
    });
    assert.equal(getDeferredStandardOrderedListMarker(edit, '\n'), '');
});

test('ignores text that is not an ordered-list item', () => {
    assert.equal(getStandardOrderedListEnterEdit('한글', 2), null);
});
