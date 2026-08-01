import { parseDocument } from 'yaml';

function countLinesThrough(source, index) {
    return source.slice(0, index).split(/\r\n|\r|\n/).length;
}

export function parseDocumentFrontMatter(content) {
    const source = String(content || '');
    const bomLength = source.startsWith('\uFEFF') ? 1 : 0;
    const openingMatch = source.slice(bomLength).match(/^---[ \t]*(?:\r?\n)/);
    if (!openingMatch) {
        return {
            hasFrontMatter: false,
            valid: false,
            data: {},
            body: source,
            bodyStart: 0,
            bodyStartLine: 1,
            yamlStart: 0,
            yamlEnd: 0,
            error: null,
        };
    }

    const yamlStart = bomLength + openingMatch[0].length;
    const closingMatch = source.slice(yamlStart).match(/^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m);
    if (!closingMatch || closingMatch.index === undefined) {
        return {
            hasFrontMatter: false,
            valid: false,
            data: {},
            body: source,
            bodyStart: 0,
            bodyStartLine: 1,
            yamlStart: 0,
            yamlEnd: 0,
            error: null,
        };
    }

    const yamlEnd = yamlStart + closingMatch.index;
    const bodyStart = yamlEnd + closingMatch[0].length;
    const yamlSource = source.slice(yamlStart, yamlEnd);
    let parsed;
    let parseError = null;
    let data = {};
    let mappingError = null;

    try {
        parsed = parseDocument(yamlSource, {
            prettyErrors: false,
            uniqueKeys: true,
        });
        parseError = parsed.errors[0] || null;
        if (!parseError) {
            const value = parsed.toJS({ maxAliasCount: 100 });
            if (value == null) {
                data = {};
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                data = value;
            } else {
                mappingError = new Error('Front matter must contain a YAML key-value mapping.');
            }
        }
    } catch (error) {
        parseError = error instanceof Error ? error : new Error(String(error));
    }

    return {
        hasFrontMatter: true,
        valid: !parseError && !mappingError,
        data,
        body: source.slice(bodyStart),
        bodyStart,
        bodyStartLine: countLinesThrough(source, bodyStart),
        yamlStart,
        yamlEnd,
        error: parseError || mappingError,
    };
}

export function getFrontMatterTitle(content) {
    const frontMatter = parseDocumentFrontMatter(content);
    if (!frontMatter.valid) return '';
    const title = frontMatter.data?.title;
    return typeof title === 'string' || typeof title === 'number'
        ? String(title).trim()
        : '';
}

export function getFirstMarkdownLineTitle(content) {
    const source = parseDocumentFrontMatter(content).body.replace(/^\uFEFF/, '');
    const firstLine = source
        .split(/\r\n|\r|\n/)
        .map(line => line.trim())
        .find(line => (
            line
            && line !== '---'
            && line !== '+++'
            && !line.startsWith('<')
        ));
    if (!firstLine) return '';

    return firstLine
        .replace(/^#{1,6}\s+/, '')
        .replace(/\s+#+\s*$/, '')
        .replace(/^>\s*/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, '$1')
        .replace(/[*_~`]/g, '')
        .trim();
}

function quoteYamlString(value) {
    return JSON.stringify(String(value ?? ''));
}

export function buildDocumentFrontMatter({
    title = '',
    author = '',
    date = '',
    tags = ['tag1', 'tag2', 'tag3'],
    draft = false,
} = {}, lineEnding = '\n') {
    const tagList = Array.isArray(tags) && tags.length ? tags : ['tag1', 'tag2', 'tag3'];
    return [
        '---',
        `title: ${quoteYamlString(title)}`,
        `author: ${quoteYamlString(author)}`,
        `date: ${quoteYamlString(date)}`,
        `tags: [${tagList.map(quoteYamlString).join(', ')}]`,
        `draft: ${draft === true ? 'true' : 'false'}`,
        '---',
        '',
        '',
    ].join(lineEnding);
}

export function formatLocalISODate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
