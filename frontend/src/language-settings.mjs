/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

export const MAX_REGISTERED_LANGUAGES = 10;

export const LANGUAGE_CATALOG = Object.freeze([
    { code: 'ar-SA', name: 'Arabic', nativeName: 'العربية', suffix: '-ar-SA' },
    { code: 'bg-BG', name: 'Bulgarian', nativeName: 'Български', suffix: '-bg-BG' },
    { code: 'ca-ES', name: 'Catalan', nativeName: 'Català', suffix: '-ca-ES' },
    { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '中国语', suffix: '-zh-CN' },
    { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '中國語', suffix: '-zh-TW' },
    { code: 'hr-HR', name: 'Croatian', nativeName: 'Hrvatski', suffix: '-hr-HR' },
    { code: 'cs-CZ', name: 'Czech', nativeName: 'Čeština', suffix: '-cs-CZ' },
    { code: 'da-DK', name: 'Danish', nativeName: 'Dansk', suffix: '-da-DK' },
    { code: 'nl-NL', name: 'Dutch', nativeName: 'Nederlands', suffix: '-nl-NL' },
    { code: 'en-US', name: 'English', nativeName: 'English', suffix: '-en-US' },
    { code: 'en-GB', name: 'English (UK)', nativeName: 'English', suffix: '-en-GB' },
    { code: 'et-EE', name: 'Estonian', nativeName: 'Eesti', suffix: '-et-EE' },
    { code: 'fi-FI', name: 'Finnish', nativeName: 'Suomi', suffix: '-fi-FI' },
    { code: 'fr-FR', name: 'French', nativeName: 'Français', suffix: '-fr-FR' },
    { code: 'de-DE', name: 'German', nativeName: 'Deutsch', suffix: '-de-DE' },
    { code: 'el-GR', name: 'Greek', nativeName: 'Ελληνικά', suffix: '-el-GR' },
    { code: 'he-IL', name: 'Hebrew', nativeName: 'עברית', suffix: '-he-IL' },
    { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', suffix: '-hi-IN' },
    { code: 'hu-HU', name: 'Hungarian', nativeName: 'Magyar', suffix: '-hu-HU' },
    { code: 'id-ID', name: 'Indonesian', nativeName: 'Bahasa Indonesia', suffix: '-id-ID' },
    { code: 'it-IT', name: 'Italian', nativeName: 'Italiano', suffix: '-it-IT' },
    { code: 'ja-JP', name: 'Japanese', nativeName: '日本語', suffix: '-ja-JP' },
    { code: 'ko-KR', name: 'Korean', nativeName: '한국어', suffix: '-ko-KR' },
    { code: 'lv-LV', name: 'Latvian', nativeName: 'Latviešu', suffix: '-lv-LV' },
    { code: 'lt-LT', name: 'Lithuanian', nativeName: 'Lietuvių', suffix: '-lt-LT' },
    { code: 'ms-MY', name: 'Malay', nativeName: 'Bahasa Melayu', suffix: '-ms-MY' },
    { code: 'nb-NO', name: 'Norwegian', nativeName: 'Norsk bokmål', suffix: '-nb-NO' },
    { code: 'fa-IR', name: 'Persian', nativeName: 'فارسی', suffix: '-fa-IR' },
    { code: 'pl-PL', name: 'Polish', nativeName: 'Polski', suffix: '-pl-PL' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português', suffix: '-pt-BR' },
    { code: 'pt-PT', name: 'Portuguese (Portugal)', nativeName: 'Português', suffix: '-pt-PT' },
    { code: 'ro-RO', name: 'Romanian', nativeName: 'Română', suffix: '-ro-RO' },
    { code: 'ru-RU', name: 'Russian', nativeName: 'Русский', suffix: '-ru-RU' },
    { code: 'sr-RS', name: 'Serbian', nativeName: 'Српски', suffix: '-sr-RS' },
    { code: 'sk-SK', name: 'Slovak', nativeName: 'Slovenčina', suffix: '-sk-SK' },
    { code: 'sl-SI', name: 'Slovenian', nativeName: 'Slovenščina', suffix: '-sl-SI' },
    { code: 'es-ES', name: 'Spanish', nativeName: 'Español', suffix: '-es-ES' },
    { code: 'es-MX', name: 'Spanish (Mexico)', nativeName: 'Español', suffix: '-es-MX' },
    { code: 'sv-SE', name: 'Swedish', nativeName: 'Svenska', suffix: '-sv-SE' },
    { code: 'th-TH', name: 'Thai', nativeName: 'ไทย', suffix: '-th-TH' },
    { code: 'tr-TR', name: 'Turkish', nativeName: 'Türkçe', suffix: '-tr-TR' },
    { code: 'uk-UA', name: 'Ukrainian', nativeName: 'Українська', suffix: '-uk-UA' },
    { code: 'ur-PK', name: 'Urdu', nativeName: 'اردو', suffix: '-ur-PK' },
    { code: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt', suffix: '-vi-VN' },
]);

// Preserve the language set and order that shipped before language management.
export const DEFAULT_REGISTERED_LANGUAGE_CODES = Object.freeze([
    'en-US',
    'es-ES',
    'fr-FR',
    'de-DE',
    'ko-KR',
    'zh-CN',
    'zh-TW',
    'ja-JP',
]);

const LANGUAGE_BY_CODE = new Map(LANGUAGE_CATALOG.map(language => [language.code, language]));

export function normalizeRegisteredLanguageCodes(value, fallback = DEFAULT_REGISTERED_LANGUAGE_CODES) {
    const source = Array.isArray(value) ? value : fallback;
    const seen = new Set();
    const normalized = [];

    for (const rawCode of source) {
        const code = String(rawCode || '').trim();
        if (!LANGUAGE_BY_CODE.has(code) || seen.has(code)) continue;
        seen.add(code);
        normalized.push(code);
        if (normalized.length >= MAX_REGISTERED_LANGUAGES) break;
    }

    return normalized;
}

export function languagesForCodes(codes) {
    return normalizeRegisteredLanguageCodes(codes, [])
        .map(code => LANGUAGE_BY_CODE.get(code))
        .filter(Boolean);
}

export function searchLanguageCatalog(query, excludedCodes = []) {
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
    const excluded = new Set(excludedCodes);
    if (!normalizedQuery) return [];

    return LANGUAGE_CATALOG.filter(language => {
        if (excluded.has(language.code)) return false;
        const searchable = `${language.name} ${language.nativeName} ${language.code}`.toLocaleLowerCase();
        return searchable.includes(normalizedQuery);
    });
}
