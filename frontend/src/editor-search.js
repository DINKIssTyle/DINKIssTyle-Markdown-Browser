import { SearchCursor } from '@codemirror/search';
import { state, el, debounce } from './main-state.js';
import { showToast } from './main-ui.js';
import { cmView } from './editor-view.js';

let findMatches = [];
let currentMatchIndex = -1;
export let isFindBarOpen = false;

export function openFindBar(withReplace = false, initialQuery = '') {
    if (!state.isEditing || !el.editorFindBar) return;

    isFindBarOpen = true;
    el.editorFindBar.classList.remove('hidden');
    if (initialQuery) {
        el.editorFindInput.value = initialQuery;
    }
    el.editorFindInput.focus();
    el.editorFindInput.select();

    if (withReplace) {
        el.editorFindReplaceCheck.checked = true;
        el.editorReplaceRow.classList.remove('hidden');
    }

    updateFindMatches();
}

function closeFindBar() {
    if (!el.editorFindBar) return;
    isFindBarOpen = false;
    el.editorFindBar.classList.add('hidden');
    if (cmView) cmView.focus();
}

export const updateFindMatchesDebounced = debounce(() => {
    if (!cmView || !isFindBarOpen) return;
    updateFindMatches(false);
}, 150);

function updateFindMatches(scrollIntoView = true) {
    if (!cmView) return;
    const query = el.editorFindInput.value;
    findMatches = [];
    currentMatchIndex = -1;
    if (!query) {
        el.editorFindCount.textContent = '';
        return;
    }
    const cursor = new SearchCursor(cmView.state.doc, query);
    while (!cursor.next().done) {
        findMatches.push({ from: cursor.value.from, to: cursor.value.to });
    }
    if (findMatches.length > 0) {
        const pos = cmView.state.selection.main.from;
        currentMatchIndex = findMatches.findIndex(match => match.from >= pos);
        if (currentMatchIndex === -1) currentMatchIndex = 0;
        highlightMatch(currentMatchIndex, scrollIntoView);
    } else {
        el.editorFindCount.textContent = 'No results';
    }
}

function highlightMatch(index, scrollIntoView = true) {
    if (!cmView || index < 0 || index >= findMatches.length) return;
    const match = findMatches[index];

    cmView.dispatch({
        selection: { anchor: match.from, head: match.to },
        scrollIntoView: scrollIntoView
    });

    el.editorFindCount.textContent = `${index + 1} of ${findMatches.length}`;
}

function findNext() {
    if (findMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % findMatches.length;
    highlightMatch(currentMatchIndex);
}

function findPrev() {
    if (findMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + findMatches.length) % findMatches.length;
    highlightMatch(currentMatchIndex);
}

function performReplace() {
    if (!cmView || currentMatchIndex === -1) return;
    const match = findMatches[currentMatchIndex];
    const replacement = el.editorReplaceInput.value;

    cmView.dispatch({
        changes: { from: match.from, to: match.to, insert: replacement },
        selection: { anchor: match.from, head: match.from + replacement.length }
    });

    updateFindMatches();
}

function performReplaceAll() {
    if (!cmView || findMatches.length === 0) return;
    const query = el.editorFindInput.value;
    const replacement = el.editorReplaceInput.value;

    let changes = [];
    const cursor = new SearchCursor(cmView.state.doc, query);
    while (!cursor.next().done) {
        changes.push({ from: cursor.value.from, to: cursor.value.to, insert: replacement });
    }

    cmView.dispatch({
        changes,
        sequential: true
    });

    updateFindMatches();
    showToast(`Replaced ${changes.length} occurrences.`);
}

export function bindEditorSearchEvents() {
    if (!el.edFindReplace) return;

    el.edFindReplace.onclick = () => {
        if (isFindBarOpen) closeFindBar();
        else openFindBar();
    };

    el.editorFindInput.oninput = () => updateFindMatches();

    // Overall Find Bar Keyboard handling
    el.editorFindBar.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFindBar();
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (e.key === 'Tab') {
            const focusableElements = [
                el.editorFindInput,
                el.editorFindPrev,
                el.editorFindNext,
                el.editorFindReplaceCheck,
                el.editorFindDone,
                el.editorReplaceInput,
                el.editorReplaceOne,
                el.editorReplaceAll
            ].filter(element => {
                if (!element) return false;
                // Check if element or its parent row is hidden
                const isReplaceElement = [el.editorReplaceInput, el.editorReplaceOne, el.editorReplaceAll].includes(element);
                if (isReplaceElement && el.editorReplaceRow.classList.contains('hidden')) {
                    return false;
                }
                return true;
            });

            const currentIndex = focusableElements.indexOf(document.activeElement);

            if (currentIndex !== -1) {
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift+Tab: move to previous, or wrap to last
                    const prevIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
                    focusableElements[prevIndex].focus();
                } else {
                    // Tab: move to next, or wrap to first
                    const nextIndex = (currentIndex + 1) % focusableElements.length;
                    focusableElements[nextIndex].focus();
                }
            } else {
                // If focus is somewhere else in the bar (like the label), go to first element
                e.preventDefault();
                focusableElements[0].focus();
            }
        }
    });

    el.editorFindInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) findPrev();
            else findNext();
            e.preventDefault();
        }
    };

    el.editorFindPrev.onclick = () => findPrev();
    el.editorFindNext.onclick = () => findNext();
    el.editorFindDone.onclick = () => closeFindBar();

    el.editorFindReplaceCheck.onchange = (e) => {
        el.editorReplaceRow.classList.toggle('hidden', !e.target.checked);
        if (e.target.checked) {
            setTimeout(() => el.editorReplaceInput.focus(), 50);
        }
    };

    el.editorReplaceOne.onclick = () => performReplace();
    el.editorReplaceAll.onclick = () => performReplaceAll();
    el.editorReplaceInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            performReplace();
            e.preventDefault();
        }
    };
}

