import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_REGISTERED_LANGUAGE_CODES,
    MAX_REGISTERED_LANGUAGES,
    languagesForCodes,
    normalizeRegisteredLanguageCodes,
    searchLanguageCatalog,
} from '../src/language-settings.mjs';

test('missing language settings preserve the previous eight-language default', () => {
    assert.deepEqual(normalizeRegisteredLanguageCodes(undefined), [...DEFAULT_REGISTERED_LANGUAGE_CODES]);
});

test('registered languages preserve order, remove duplicates, and stop at ten', () => {
    const normalized = normalizeRegisteredLanguageCodes([
        'ko-KR', 'en-US', 'ko-KR', 'fr-FR', 'de-DE', 'es-ES', 'ja-JP',
        'zh-CN', 'zh-TW', 'it-IT', 'pt-BR', 'uk-UA',
    ]);

    assert.equal(normalized.length, MAX_REGISTERED_LANGUAGES);
    assert.deepEqual(normalized, [
        'ko-KR', 'en-US', 'fr-FR', 'de-DE', 'es-ES',
        'ja-JP', 'zh-CN', 'zh-TW', 'it-IT', 'pt-BR',
    ]);
});

test('an explicitly empty language list stays empty', () => {
    assert.deepEqual(normalizeRegisteredLanguageCodes([]), []);
    assert.deepEqual(languagesForCodes([]), []);
});

test('catalog search matches names, native names, and locale codes', () => {
    assert.equal(searchLanguageCatalog('Korean')[0]?.code, 'ko-KR');
    assert.equal(searchLanguageCatalog('한국어')[0]?.code, 'ko-KR');
    assert.equal(searchLanguageCatalog('ja-JP')[0]?.code, 'ja-JP');
    assert.equal(searchLanguageCatalog('Korean', ['ko-KR']).length, 0);
});
