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
