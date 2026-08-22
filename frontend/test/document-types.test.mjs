import test from 'node:test';
import assert from 'node:assert/strict';

import {
    documentTypeFromPath,
    isMarkdownPath,
    isHTMLPath,
    isSourceCodePath,
    isPlainTextPath,
    isTextPreviewPath,
    isEditableDocumentType,
    isSupportedPreviewPath,
    deriveTabTitle,
} from '../src/main-state.js';

test('identifies markdown paths correctly', () => {
    assert.equal(isMarkdownPath('/docs/notes.md'), true);
    assert.equal(isMarkdownPath('/docs/README.MARKDOWN'), true);
    assert.equal(isMarkdownPath('/docs/script.py'), false);
    assert.equal(isMarkdownPath('/docs/data.json'), false);
    assert.equal(isMarkdownPath(''), false);
});

test('identifies html paths correctly', () => {
    assert.equal(isHTMLPath('/docs/index.html'), true);
    assert.equal(isHTMLPath('/docs/page.htm'), true);
    assert.equal(isHTMLPath('/docs/notes.md'), false);
});

test('identifies source code paths correctly', () => {
    const codeFiles = [
        'main.py', 'script.lua', 'main.c', 'header.h', 'controller.m', 'view.mm',
        'app.cpp', 'app.hpp', 'index.js', 'index.ts', 'App.jsx', 'App.tsx',
        'main.go', 'lib.rs', 'Main.java', 'App.kt', 'App.swift', 'app.rb',
        'script.sh', 'query.sql', 'config.json', 'config.yaml', 'config.yml',
        'Cargo.toml', 'styles.css', 'styles.scss', 'layout.xml'
    ];
    for (const file of codeFiles) {
        assert.equal(isSourceCodePath(`/path/to/${file}`), true, `Failed for ${file}`);
    }
    assert.equal(isSourceCodePath('/path/to/note.md'), false);
    assert.equal(isSourceCodePath('/path/to/image.png'), false);
});

test('identifies plain text paths correctly', () => {
    assert.equal(isPlainTextPath('/path/to/log.txt'), true);
    assert.equal(isPlainTextPath('/path/to/app.log'), true);
    assert.equal(isPlainTextPath('/path/to/settings.ini'), true);
    assert.equal(isPlainTextPath('/path/to/nginx.conf'), true);
    assert.equal(isPlainTextPath('/path/to/app.env'), true);
    assert.equal(isPlainTextPath('/repo/LICENSE'), true);
    assert.equal(isPlainTextPath('/repo/Makefile'), true);
    assert.equal(isPlainTextPath('/repo/Dockerfile'), true);
    assert.equal(isPlainTextPath('/path/to/script.py'), false);
});

test('derives document types accurately', () => {
    assert.equal(documentTypeFromPath('/path/to/note.md'), 'markdown');
    assert.equal(documentTypeFromPath('/path/to/page.html'), 'html');
    assert.equal(documentTypeFromPath('/path/to/photo.jpg'), 'image');
    assert.equal(documentTypeFromPath('/path/to/script.py'), 'code');
    assert.equal(documentTypeFromPath('/path/to/script.lua'), 'code');
    assert.equal(documentTypeFromPath('/path/to/main.c'), 'code');
    assert.equal(documentTypeFromPath('/path/to/view.m'), 'code');
    assert.equal(documentTypeFromPath('/path/to/notes.txt'), 'text');
    assert.equal(documentTypeFromPath('/path/to/archive.zip'), 'unsupported');
});

test('identifies editable document types', () => {
    assert.equal(isEditableDocumentType('markdown'), true);
    assert.equal(isEditableDocumentType('code'), true);
    assert.equal(isEditableDocumentType('text'), true);
    assert.equal(isEditableDocumentType('html'), false);
    assert.equal(isEditableDocumentType('image'), false);
    assert.equal(isEditableDocumentType('unsupported'), false);
});

test('includes auxiliary text and code files in supported preview paths', () => {
    assert.equal(isSupportedPreviewPath('/path/to/script.py'), true);
    assert.equal(isSupportedPreviewPath('/path/to/notes.txt'), true);
    assert.equal(isSupportedPreviewPath('/path/to/index.html'), true);
    assert.equal(isSupportedPreviewPath('/path/to/image.png'), true);
    assert.equal(isSupportedPreviewPath('/path/to/binary.exe'), false);
});

test('derives tab title using filename for code and plain text files', () => {
    const pythonContent = '"""\nModule Header\n"""\nimport os\n\ndef main(): pass';
    assert.equal(deriveTabTitle('/project/app/main.py', pythonContent), 'main.py');

    const cContent = '/*\n * Copyright 2026\n */\n#include <stdio.h>\nint main() {}';
    assert.equal(deriveTabTitle('/project/src/main.c', cContent), 'main.c');

    const textContent = 'First line of notes\nSecond line';
    assert.equal(deriveTabTitle('/docs/todo.txt', textContent), 'todo.txt');

    const markdownContent = '# Main Heading\nParagraph text';
    assert.equal(deriveTabTitle('/docs/guide.md', markdownContent), 'Main Heading');
});
