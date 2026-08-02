export function getStandardOrderedListEnterEdit(lineText, cursorOffset) {
    const beforeCursor = lineText.slice(0, cursorOffset);
    const afterCursor = lineText.slice(cursorOffset);
    const match = beforeCursor.match(/^(\s*)\d+([.)])(\s+)(.*)$/);
    if (!match) return null;

    const [, indent, delimiter, spacing, beforeContent] = match;
    const marker = `${indent}1${delimiter}${spacing}`;
    const markerLength = indent.length + 1 + delimiter.length + spacing.length;
    const itemIsEmpty = !beforeContent.trim() && !afterCursor.trim();

    if (itemIsEmpty) {
        return {
            fromOffset: indent.length,
            toOffset: markerLength,
            insert: '',
            cursorOffset: indent.length,
        };
    }

    const insert = `\n${marker}`;
    return {
        fromOffset: cursorOffset,
        toOffset: cursorOffset,
        insert,
        cursorOffset: cursorOffset + insert.length,
    };
}

export function getDeferredStandardOrderedListMarker(edit, normalizedLineBreak) {
    if (!edit || !normalizedLineBreak || edit.fromOffset !== edit.toOffset || !edit.insert.startsWith(normalizedLineBreak)) {
        return '';
    }
    return edit.insert.slice(normalizedLineBreak.length);
}
