export const KOREAN_IME_ENTER_WINDOW_MS = 100;

export function normalizeKoreanImeLineBreak({
    enabled,
    text,
    composing,
    justEndedAt,
    now,
}) {
    if (!enabled || text !== '\n\n') return null;

    const elapsedSinceCompositionEnd = now - justEndedAt;
    if (!composing && (!justEndedAt || elapsedSinceCompositionEnd < 0 || elapsedSinceCompositionEnd >= KOREAN_IME_ENTER_WINDOW_MS)) {
        return null;
    }

    return '\n';
}

export function shouldRunSlashCommandAfterImeCommit({
    enabled,
    key,
    composing,
    hasMenu,
    hasCommand,
}) {
    return !!enabled && key === 'Enter' && !!composing && !!hasMenu && !!hasCommand;
}

export function shouldMoveSlashSelectionAfterImeCommit({
    enabled,
    key,
    composing,
    hasMenu,
    hasCommand,
}) {
    return !!enabled && (key === 'ArrowDown' || key === 'ArrowUp') &&
        !!composing && !!hasMenu && !!hasCommand;
}

export function isImeKeyboardEvent({
    eventIsComposing,
    keyCode,
    codeMirrorComposing,
    codeMirrorCompositionStarted,
    observedComposing,
    justEndedAt,
    now,
}) {
    const elapsedSinceCompositionEnd = Number(now) - Number(justEndedAt);
    const recentlyEnded = !!justEndedAt && Number.isFinite(elapsedSinceCompositionEnd) &&
        elapsedSinceCompositionEnd >= 0 && elapsedSinceCompositionEnd < KOREAN_IME_ENTER_WINDOW_MS;
    return !!eventIsComposing || keyCode === 229 || !!codeMirrorComposing ||
        !!codeMirrorCompositionStarted || !!observedComposing || recentlyEnded;
}
