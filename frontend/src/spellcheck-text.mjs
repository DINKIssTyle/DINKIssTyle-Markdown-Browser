const SPELLCHECK_CHUNK_TARGET_LENGTH = 700;
const SPELLCHECK_CHUNK_MAX_LENGTH = 1000;
const SPELLCHECK_COORDINATE_RECOVERY_RADIUS = 360;

function splitOversizedSpellcheckBlock(block) {
    if (block.content.length <= SPELLCHECK_CHUNK_MAX_LENGTH) {
        return [block];
    }

    const pieces = [];
    let start = 0;
    while (start < block.content.length) {
        const maxEnd = Math.min(block.content.length, start + SPELLCHECK_CHUNK_MAX_LENGTH);
        if (maxEnd >= block.content.length) {
            pieces.push({ start: block.start + start, content: block.content.slice(start) });
            break;
        }

        const windowStart = Math.min(block.content.length, start + SPELLCHECK_CHUNK_TARGET_LENGTH);
        const windowText = block.content.slice(windowStart, maxEnd);
        let relativeCut = -1;
        for (const boundary of ['\n', '. ', '.\n', '? ', '?\n', '! ', '!\n', '。', '؟ ']) {
            const index = windowText.lastIndexOf(boundary);
            if (index > relativeCut) {
                relativeCut = index + boundary.length;
            }
        }

        const end = relativeCut > 0 ? windowStart + relativeCut : maxEnd;
        pieces.push({ start: block.start + start, content: block.content.slice(start, end) });
        start = end;
    }
    return pieces.filter(piece => piece.content.trim());
}

function createSpellcheckBlocks(content) {
    const blocks = [];
    const blockRegex = /(?:^|\n)(?:#{1,6}\s.+(?:\n+|$)|```[\s\S]*?(?:```|$)|(?:[-*+]\s.+(?:\n|$))+|(?:\d+\.\s.+(?:\n|$))+|(?:>\s?.+(?:\n|$))+|(?:\|.*\|(?:\n|$))+|[^\n]+(?:\n(?!\n)[^\n]+)*)(?:\n*)/g;
    let match;

    while ((match = blockRegex.exec(content)) !== null) {
        const raw = match[0];
        const leadingNewline = raw.startsWith('\n') ? 1 : 0;
        const blockContent = raw.slice(leadingNewline);
        if (!blockContent.trim()) continue;
        blocks.push({
            start: match.index + leadingNewline,
            content: blockContent,
        });
    }

    return blocks.flatMap(splitOversizedSpellcheckBlock);
}

export function createSpellcheckChunks(content) {
    const blocks = createSpellcheckBlocks(content);
    if (blocks.length === 0) return [];

    const chunks = [];
    let current = null;

    for (const block of blocks) {
        if (!current) {
            current = { start: block.start, content: block.content };
            continue;
        }

        const gap = content.slice(current.start + current.content.length, block.start);
        const candidate = `${current.content}${gap}${block.content}`;
        const currentIsHeadingOnly = /^#{1,6}\s.+\s*$/.test(current.content.trim());
        const shouldAttachToHeading = currentIsHeadingOnly && candidate.length <= SPELLCHECK_CHUNK_MAX_LENGTH;

        if (candidate.length <= SPELLCHECK_CHUNK_TARGET_LENGTH || shouldAttachToHeading) {
            current.content = candidate;
            continue;
        }

        chunks.push(current);
        current = { start: block.start, content: block.content };
    }

    if (current) chunks.push(current);

    return chunks.flatMap(chunk => {
        if (chunk.content.length <= SPELLCHECK_CHUNK_MAX_LENGTH) {
            return [chunk];
        }
        return splitOversizedSpellcheckBlock(chunk);
    }).map(chunk => {
        let start = chunk.start;
        let text = chunk.content;
        while (text.length && /^\s$/.test(text[0])) {
            text = text.slice(1);
            start += 1;
        }
        while (text.length && /\s$/.test(text[text.length - 1])) {
            text = text.slice(0, -1);
        }
        return { start, content: text };
    }).filter(chunk => chunk.content.trim());
}

export function findSpellcheckOriginalInChunk(content, original, startHint = 0) {
    if (!original) return -1;
    const exactAtHint = Number.isInteger(startHint) ? content.indexOf(original, Math.max(0, startHint)) : -1;
    if (exactAtHint >= 0 && Math.abs(exactAtHint - startHint) <= SPELLCHECK_COORDINATE_RECOVERY_RADIUS) {
        return exactAtHint;
    }

    if (Number.isInteger(startHint)) {
        const radiusStart = Math.max(0, startHint - SPELLCHECK_COORDINATE_RECOVERY_RADIUS);
        const radiusEnd = Math.min(content.length, startHint + SPELLCHECK_COORDINATE_RECOVERY_RADIUS + original.length);
        const nearbyIndex = content.slice(radiusStart, radiusEnd).indexOf(original);
        if (nearbyIndex >= 0) {
            return radiusStart + nearbyIndex;
        }
    }

    const matches = [];
    let index = content.indexOf(original);
    while (index >= 0) {
        matches.push(index);
        index = content.indexOf(original, index + original.length);
    }
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1 && Number.isInteger(startHint)) {
        return matches.reduce((best, next) => (
            Math.abs(next - startHint) < Math.abs(best - startHint) ? next : best
        ), matches[0]);
    }
    return -1;
}

export function normalizeSpellcheckSuggestions(suggestions, content, offset = 0, tabId = '') {
    return (suggestions || [])
        .map((suggestion, index) => {
            const original = String(suggestion.original || '');
            const replacement = String(suggestion.replacement || '');
            let start = Number(suggestion.start);
            let end = Number(suggestion.end);
            if (!Number.isInteger(start) || !Number.isInteger(end) || content.slice(start, end) !== original) {
                const recoveredStart = findSpellcheckOriginalInChunk(content, original, start);
                if (recoveredStart >= 0) {
                    start = recoveredStart;
                    end = recoveredStart + original.length;
                }
            }
            return {
                id: `spell-${Date.now()}-${offset}-${index}`,
                tabId,
                original,
                replacement,
                reason: String(suggestion.reason || ''),
                start: start + offset,
                end: end + offset,
            };
        })
        .filter(suggestion => {
            const localStart = suggestion.start - offset;
            const localEnd = suggestion.end - offset;
            if (!Number.isInteger(localStart) || !Number.isInteger(localEnd)) return false;
            if (localStart < 0 || localEnd <= localStart || localEnd > content.length) return false;
            if (!suggestion.original || !suggestion.replacement || suggestion.original === suggestion.replacement) return false;
            return content.slice(localStart, localEnd) === suggestion.original;
        });
}

export function mergeSpellcheckSuggestions(existing, incoming, currentContent) {
    const merged = [...existing];
    const occupied = new Set(existing.map(suggestion => `${suggestion.start}:${suggestion.end}:${suggestion.replacement}`));
    for (const suggestion of incoming) {
        if (currentContent.slice(suggestion.start, suggestion.end) !== suggestion.original) {
            continue;
        }
        const key = `${suggestion.start}:${suggestion.end}:${suggestion.replacement}`;
        if (occupied.has(key)) {
            continue;
        }
        occupied.add(key);
        merged.push(suggestion);
    }
    merged.sort((a, b) => a.start === b.start ? a.end - b.end : a.start - b.start);
    return merged;
}

