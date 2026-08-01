import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildDocumentFrontMatter,
    formatLocalISODate,
    getFirstMarkdownLineTitle,
    getFrontMatterTitle,
    parseDocumentFrontMatter,
} from '../src/frontmatter.mjs';

test('parses YAML front matter and separates the Markdown body', () => {
    const source = `---\ntitle: "Metadata title"\nauthor: "DINKI"\ntags: [markdown, metadata]\ndraft: false\n---\n\n# Body title\nText`;
    const result = parseDocumentFrontMatter(source);

    assert.equal(result.hasFrontMatter, true);
    assert.equal(result.valid, true);
    assert.equal(result.data.title, 'Metadata title');
    assert.deepEqual(result.data.tags, ['markdown', 'metadata']);
    assert.equal(result.data.draft, false);
    assert.equal(result.body, '\n# Body title\nText');
    assert.equal(getFrontMatterTitle(source), 'Metadata title');
});

test('does not treat a later thematic break as front matter', () => {
    const source = '# Title\n\n---\n\nText';
    const result = parseDocumentFrontMatter(source);

    assert.equal(result.hasFrontMatter, false);
    assert.equal(result.body, source);
});

test('builds valid front matter with placeholders and local date formatting', () => {
    const block = buildDocumentFrontMatter({
        title: 'A "quoted" title',
        author: '',
        date: formatLocalISODate(new Date(2026, 7, 1)),
    });
    const parsed = parseDocumentFrontMatter(`${block}# Body`);

    assert.equal(parsed.valid, true);
    assert.equal(parsed.data.title, 'A "quoted" title');
    assert.equal(parsed.data.author, '');
    assert.equal(parsed.data.date, '2026-08-01');
    assert.deepEqual(parsed.data.tags, ['tag1', 'tag2', 'tag3']);
    assert.equal(parsed.data.draft, false);
});

test('derives an insertion title from the first Markdown line', () => {
    assert.equal(getFirstMarkdownLineTitle('\n# First heading\nBody'), 'First heading');
});

test('skips leading HTML when deriving an insertion title', () => {
    const source = '\n<div align="left"><img src="icon.png"></div>\n\n# First Markdown heading\nBody';
    assert.equal(getFirstMarkdownLineTitle(source), 'First Markdown heading');
});

test('preserves front matter keys in their authored order', () => {
    const source = '---\ntitle: Title\nauthor: Author\nteam: DKST\ndate: 2026-08-01\n---\nBody';
    const parsed = parseDocumentFrontMatter(source);
    assert.deepEqual(Object.keys(parsed.data), ['title', 'author', 'team', 'date']);
});
