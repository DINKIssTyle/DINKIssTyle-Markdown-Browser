/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

export const DEFAULT_CONTENT_FONT_SIZE = 16;
// 스플래쉬 화면 최소시간
export const MIN_SPLASH_MS = 300;
// 시각적 매칭을 위해 조절함
export const EDITOR_FONT_VISUAL_SCALE = 0.9;

// 레이아웃 여백 설정값 (기본: 좁음 8%, 넓음 18%)
export const LAYOUT_MARGIN_NARROW = "3%";
export const LAYOUT_MARGIN_WIDE = "10%";

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

export const SLASH_COMMAND_DEFINITIONS = Object.freeze([
    { id: 'bold', label: 'Bold', token: '**', keywords: 'bold strong', aliases: ['볼드', '굵게', '굵은글씨', 'ㅂ'], action: 'bold' },
    { id: 'italic', label: 'Italic', token: '*', keywords: 'italic emphasis', aliases: ['이탤릭', '이탤릭체', '기울임', 'ㄱㅇ', 'ㅇㅌ'], action: 'italic' },
    { id: 'underline', label: 'Underline', token: '<u>', keywords: 'underline', aliases: ['언더라인', '밑줄', 'ㅁㅈ', 'ㅇㄷ'], action: 'underline' },
    { id: 'strike', label: 'Strikethrough', token: '~~', keywords: 'strike strikethrough', aliases: ['취소선', '스트라이크', 'ㅊㅅㅅ'], action: 'strike' },
    { id: 'quote', label: 'Blockquote', token: '>', keywords: 'quote blockquote', aliases: ['인용', '인용문', '블록인용', 'ㅇㅇ'], action: 'quote' },
    { id: 'h1', label: 'Heading 1', token: '#', keywords: 'h1 heading title', aliases: ['헤딩', '헤딩1', '헤드', 'ㅎ', '헤', '헤딩원'], action: 'h1' },
    { id: 'h2', label: 'Heading 2', token: '##', keywords: 'h2 heading', aliases: ['헤딩', '헤딩2', '헤드', 'ㅎ', '헤', '헤딩투'], action: 'h2' },
    { id: 'h3', label: 'Heading 3', token: '###', keywords: 'h3 heading', aliases: ['헤딩', '헤딩3', '헤드', 'ㅎ', '헤', '헤딩쓰리'], action: 'h3' },
    { id: 'ul', label: 'Bullet List', token: '- ', keywords: 'unordered list bullet ul', aliases: ['리스트', '목록', '불릿', '글머리표', 'ㄹㅅㅌ'], action: 'ul' },
    { id: 'ol', label: 'Numbered List', token: '1. ', keywords: 'ordered list number ol', aliases: ['번호목록', '숫자목록', '리스트', '목록', 'ㅂㅎ'], action: 'ol' },
    { id: 'hr', label: 'Horizontal Rule', token: '---', keywords: 'rule divider hr', aliases: ['구분선', '수평선', '라인', 'ㄱㅂㅅ'], action: 'hr' },
    { id: 'link', label: 'Link', token: '[ ]( )', keywords: 'link url', aliases: ['링크', '주소', '링크삽입', 'ㄹㅋ'], action: 'link' },
    { id: 'image', label: 'Image', token: '![ ]( )', keywords: 'image img photo', aliases: ['이미지', '사진', '그림', 'ㅇㅁㅈ'], action: 'image' },
    { id: 'code', label: 'Code Block', token: '```', keywords: 'code block fence', aliases: ['코드', '코드블록', '코드블럭', 'ㅋㄷ'], action: 'code' },
    { id: 'table', label: 'Table', token: '| |', keywords: 'table grid', aliases: ['테이블', '표', 'ㅌㅇㅂ'], action: 'table' },
    { id: 'div', label: 'DIV Wrapper', token: '<div>', keywords: 'div wrapper align', aliases: ['디브', '박스', '정렬박스', 'ㄷㅂ'], action: 'div' },
    { id: 'task', label: 'Task List', token: '- [ ]', keywords: 'task checklist todo', aliases: ['체크리스트', '할일', '할일목록', '작업목록', 'ㅊㅋ'], action: 'task' },
    { id: 'find', label: 'Find', token: '/find', keywords: 'find search', aliases: ['찾기', '검색', 'ㅋㄷ', 'ㄱㅅ'], action: 'find' },
    { id: 'spellcheck', label: 'Spellcheck', token: '/spellcheck', keywords: 'spellcheck spell proofread grammar correction', aliases: ['맞춤법', '맞춤법검사', '교정', '문법검사', 'ㅁㅊㅂ'], action: 'spellcheck' },
    { id: 'translate-document', label: 'Translate Document', token: '/translate', keywords: 'translate document translation', aliases: ['번역', '문서번역', '번역문서', 'ㅂㅇ'], action: 'translateDocument' },
    { id: 'latex', label: 'LaTeX', token: '$$', keywords: 'latex math equation', aliases: ['수식', '라텍스', '공식', 'ㅅㅅ'], action: 'latex' },
    { id: 'emoji', label: 'Emoji', token: ':)', keywords: 'emoji emoticon smile', aliases: ['이모지', '이모티콘', '표정', 'ㅇㅁㅈ'], action: 'emoji' },
]);

export const ASK_AI_SLASH_COMMAND = Object.freeze({
    id: 'ask-ai',
    label: 'Ask AI',
    token: 'AI',
    keywords: 'ask ai question prompt assistant',
    aliases: ['ai', 'ask', '질문', '문의', '챗', '대화'],
    action: 'askAI',
});

export function getSlashCommands(actions = {}, options = {}) {
    const commands = SLASH_COMMAND_DEFINITIONS.map(command => ({
        id: command.id,
        label: command.label,
        token: command.token,
        keywords: command.keywords,
        aliases: command.aliases,
        run: actions[command.action],
    })).filter(command => typeof command.run === 'function');

    if (options.includeAskAI && typeof actions[ASK_AI_SLASH_COMMAND.action] === 'function') {
        commands.unshift({
            id: ASK_AI_SLASH_COMMAND.id,
            label: ASK_AI_SLASH_COMMAND.label,
            token: ASK_AI_SLASH_COMMAND.token,
            keywords: ASK_AI_SLASH_COMMAND.keywords,
            aliases: ASK_AI_SLASH_COMMAND.aliases,
            run: actions[ASK_AI_SLASH_COMMAND.action],
        });
    }

    return commands;
}

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
