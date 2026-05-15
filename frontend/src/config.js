/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

export const DEFAULT_CONTENT_FONT_SIZE = 16;
// 스플래쉬 화면 최소시간
export const MIN_SPLASH_MS = 300;
// 시각적 매칭을 위해 조절함
export const EDITOR_FONT_VISUAL_SCALE = 0.9;

export const TRANSLATION_LANGUAGES = Object.freeze([
    { code: 'en-US', name: 'English', nativeName: 'English', suffix: '-en-US' },
    { code: 'es-ES', name: 'Spanish', nativeName: 'Español', suffix: '-es-ES' },
    { code: 'fr-FR', name: 'French', nativeName: 'Français', suffix: '-fr-FR' },
    { code: 'de-DE', name: 'German', nativeName: 'Deutsch', suffix: '-de-DE' },
    { code: 'ko-KR', name: 'Korean', nativeName: '한국어', suffix: '-ko-KR' },
    { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '中国语', suffix: '-zh-CN' },
    { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '中國語', suffix: '-zh-TW' },
    { code: 'ja-JP', name: 'Japanese', nativeName: '日本語', suffix: '-ja-JP' },
]);

export const DEFAULT_TRANSLATION_LANGUAGE_CODES = Object.freeze(['ko-KR', 'en-US']);

export const AI_SUPPORT_AGENT_POP_MS = 300;
export const AI_SUPPORT_AGENT_POP_SCALE = 1.15;
export const AI_SUPPORT_AGENT_POP_ORIGIN = 'center center';

export const TAB_CLOSE_ANIMATION = Object.freeze({
    collapseMs: 200,
    collapseDelayMs: 60,
    contentFilterMs: 280,
    contentOpacityMs: 200,
    contentTransformMs: 80,
    contentBlurPx: 8,
    contentScale: 0.12,
    fallbackPaddingMs: 40,
    collapseEasing: 'cubic-bezier(0.2, 0, 0, 1)',
    contentEasing: 'ease-in',
});
