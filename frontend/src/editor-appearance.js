import { Compartment } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { oneDark } from '@codemirror/theme-one-dark';
import { state, el } from './main-state.js';
import { getCurrentAccentColor } from './main-theme.js';
import { cmView } from './editor-view.js';

export const themeCompartment = new Compartment();
export const tokenColorCompartment = new Compartment();

export const EDITOR_TOKEN_COLOR_FIELDS = Object.freeze([
    { key: 'plain', label: 'Plain Text' },
    { key: 'heading', label: 'Headings' },
    { key: 'emphasis', label: 'Emphasis' },
    { key: 'link', label: 'Links' },
    { key: 'quote', label: 'Blockquotes' },
    { key: 'code', label: 'Inline Code' },
    { key: 'codeBg', label: 'Code Background' },
    { key: 'marker', label: 'Markers' },
    { key: 'htmlTag', label: 'HTML Tags' },
    { key: 'attribute', label: 'Attributes' },
    { key: 'string', label: 'Strings' },
    { key: 'keyword', label: 'Keywords' },
    { key: 'comment', label: 'Comments' },
    { key: 'invalid', label: 'Invalid' },
]);

const EDITOR_BACKGROUND_DEFAULTS = Object.freeze({
    light: '#ffffff',
    dark: '#1f2937',
});

const EDITOR_TOKEN_COLOR_DEFAULTS = Object.freeze({
    light: Object.freeze({
        plain: '#1f2937',
        heading: '#1f2937',
        emphasis: '#375d99',
        link: '#0071e3',
        quote: '#5b6f8f',
        code: '#d14',
        codeBg: '#dfe3eaff',
        marker: '#0071e3',
        htmlTag: '#0a7f8f',
        attribute: '#8f5f00',
        string: '#0f7b32',
        keyword: '#8a3ffc',
        comment: '#6b7280',
        invalid: '#d92d20',
    }),
    dark: Object.freeze({
        plain: '#e5e7eb',
        heading: '#e5e7eb',
        emphasis: '#c8d8ff',
        link: '#7db7ff',
        quote: '#9ab3d5',
        code: '#ff8aa1',
        codeBg: 'rgba(255, 255, 255, 0.1)',
        marker: '#7db7ff',
        htmlTag: '#6ee7f2',
        attribute: '#ffd166',
        string: '#8ee6a1',
        keyword: '#d8b4fe',
        comment: '#9ca3af',
        invalid: '#fda29b',
    }),
});

export const EDITOR_TOKEN_COLOR_PRESETS = Object.freeze([
    {
        key: 'default',
        label: 'Default',
        colors: null,
        background: null,
    },
    {
        key: 'seoul',
        label: 'Seoul',
        background: '#fcfcfc',
        colors: Object.freeze({
            plain: '#404040',
            heading: '#618138',
            emphasis: '#f294da',
            link: '#2d4285',
            quote: '#e36d3e',
            code: '#9c4025',
            codeBg: '#f7dda7',
            marker: '#59555e',
            htmlTag: '#cb5b30',
            attribute: '#a41b4a',
            string: '#a83a0a',
            keyword: '#639f2d',
            comment: '#548560',
            invalid: '#c7445c',
        }),
    },
    {
        key: 'jeonju',
        label: 'Jeonju',
        background: '#e0e7e8',
        colors: Object.freeze({
            plain: '#642242',
            heading: '#a83449',
            emphasis: '#595384',
            link: '#306bb2',
            quote: '#cb5899',
            code: '#6c407c',
            codeBg: '#eacecd',
            marker: '#0b773a',
            htmlTag: '#5e2a65',
            attribute: '#b33373',
            string: '#817209',
            keyword: '#9f48ac',
            comment: '#675ca3',
            invalid: '#ae2d40',
        }),
    },
    {
        key: 'gyeongju',
        label: 'Gyeongju',
        background: '#181625',
        colors: Object.freeze({
            plain: '#d89f9d',
            heading: '#c93c8c',
            emphasis: '#cce1ed',
            link: '#98b2a8',
            quote: '#c6b097',
            code: '#ab9ac4',
            codeBg: '#3d3d3d',
            marker: '#aa6054',
            htmlTag: '#9d838a',
            attribute: '#bbadab',
            string: '#db739b',
            keyword: '#d2894b',
            comment: '#7f9cb2',
            invalid: '#9080b9',
        }),
    },
    {
        key: 'night',
        label: 'Night',
        background: '#1a1b26',
        colors: Object.freeze({
            plain: '#c0caf5',
            heading: '#c0caf5',
            emphasis: '#7aa2f7',
            link: '#7dcfff',
            quote: '#6b718cff',
            code: '#f7768e',
            codeBg: 'rgba(41, 46, 66, 0.6)',
            marker: '#7aa2f7',
            htmlTag: '#2ac3de',
            attribute: '#e0af68',
            string: '#9ece6a',
            keyword: '#bb9af7',
            comment: '#565f89',
            invalid: '#f7768e',
        }),
    },
    {
        key: 'nord',
        label: 'Nord',
        background: '#2e3440',
        colors: Object.freeze({
            plain: '#d8dee9',
            heading: '#eceff4',
            emphasis: '#81a1c1',
            link: '#88c0d0',
            quote: '#a5a5a5',
            code: '#d08770',
            codeBg: 'rgba(76, 86, 106, 0.4)',
            marker: '#5e81ac',
            htmlTag: '#8fbcbb',
            attribute: '#ebcb8b',
            string: '#a3be8c',
            keyword: '#b48ead',
            comment: '#bfbfbf',
            invalid: '#bf616a',
        }),
    },
    {
        key: 'catppuccin',
        label: 'Catppuccin',
        background: '#1e1e2e',
        colors: Object.freeze({
            plain: '#cdd6f4',
            heading: '#cdd6f4',
            emphasis: '#cba6f7',
            link: '#89b4fa',
            quote: '#b8b8b8',
            code: '#f5c2e7',
            codeBg: 'rgba(49, 50, 68, 0.6)',
            marker: '#89b4fa',
            htmlTag: '#94e2d5',
            attribute: '#f9e2af',
            string: '#a6e3a1',
            keyword: '#cba6f7',
            comment: '#7f849c',
            invalid: '#f38ba8',
        }),
    },
    {
        key: 'one-dark-pro',
        label: 'One Dark Pro',
        background: '#282c34',
        colors: Object.freeze({
            plain: '#bebebe',
            heading: '#abb2bf',
            emphasis: '#61afef',
            link: '#56b6c2',
            quote: '#a7a7a7',
            code: '#e06c75',
            codeBg: 'rgba(85, 85, 85, 0.7)',
            marker: '#61afef',
            htmlTag: '#e06c75',
            attribute: '#d19a66',
            string: '#98c379',
            keyword: '#c678dd',
            comment: '#d2d2d2',
            invalid: '#e06c75',
        }),
    },
    {
        key: 'solarized-light',
        label: 'Solarized',
        background: '#fdf6e3',
        colors: Object.freeze({
            plain: '#657b83',
            heading: '#586e75',
            emphasis: '#268bd2',
            link: '#2aa198',
            quote: '#686868',
            code: '#d33682',
            codeBg: 'rgba(238, 232, 213, 0.6)',
            marker: '#268bd2',
            htmlTag: '#2aa198',
            attribute: '#b58900',
            string: '#859900',
            keyword: '#6c71c4',
            comment: '#6e6e6e',
            invalid: '#dc322f',
        }),
    },
]);

function getEditorThemeName() {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function getEditorDefaultTokenColors(themeName = getEditorThemeName()) {
    const defaults = { ...(EDITOR_TOKEN_COLOR_DEFAULTS[themeName] || EDITOR_TOKEN_COLOR_DEFAULTS.light) };
    if (themeName === 'light') {
        const accentColor = getCurrentAccentColor();
        defaults.link = accentColor;
        defaults.marker = accentColor;
    }
    return defaults;
}

export function getEditorDefaultBackgroundColor(themeName = getEditorThemeName()) {
    return EDITOR_BACKGROUND_DEFAULTS[themeName] || EDITOR_BACKGROUND_DEFAULTS.light;
}

export function normalizeTokenColors(colors = {}, themeName = getEditorThemeName()) {
    const defaults = getEditorDefaultTokenColors(themeName);
    return Object.fromEntries(
        EDITOR_TOKEN_COLOR_FIELDS.map(({ key }) => [key, isValidHexColor(colors[key]) ? colors[key] : defaults[key]])
    );
}

export function normalizeBackgroundColor(color, themeName = getEditorThemeName()) {
    return isValidHexColor(color) ? color : getEditorDefaultBackgroundColor(themeName);
}

function isValidHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function hexToRgb(hex) {
    const normalized = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
}

function getRelativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 1;
    const channel = value => {
        const normalized = value / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function buildEditorMarkdownHighlight(colors) {
    return HighlightStyle.define([
        { tag: tags.heading1, color: colors.heading, fontSize: '1.5em', fontWeight: '800' },
        { tag: tags.heading2, color: colors.heading, fontSize: '1.35em', fontWeight: '800' },
        { tag: tags.heading3, color: colors.heading, fontSize: '1.22em', fontWeight: '760' },
        { tag: tags.heading4, color: colors.heading, fontSize: '1.12em', fontWeight: '740' },
        { tag: tags.heading5, color: colors.heading, fontSize: '1.06em', fontWeight: '720' },
        { tag: tags.heading6, color: colors.heading, fontSize: '1.02em', fontWeight: '700' },
        { tag: tags.strong, color: colors.heading, fontWeight: '800' },
        { tag: tags.emphasis, color: colors.emphasis, fontStyle: 'italic' },
        { tag: tags.strikethrough, color: colors.comment, textDecoration: 'line-through' },
        { tag: tags.link, color: colors.link, textDecoration: 'underline', textUnderlineOffset: '2px' },
        { tag: tags.url, color: colors.link },
        { tag: tags.quote, color: colors.quote, fontStyle: 'italic' },
        { tag: tags.monospace, color: colors.code, backgroundColor: colors.codeBg },
        { tag: tags.contentSeparator, color: colors.comment, fontWeight: '700' },
        { tag: tags.list, color: colors.marker, fontWeight: '700' },
        { tag: tags.meta, color: colors.comment },
        { tag: tags.processingInstruction, color: colors.marker, fontWeight: '700' },
        { tag: tags.tagName, color: colors.htmlTag, fontWeight: '700' },
        { tag: tags.angleBracket, color: colors.comment },
        { tag: tags.attributeName, color: colors.attribute },
        { tag: tags.attributeValue, color: colors.string },
        { tag: tags.string, color: colors.string },
        { tag: tags.keyword, color: colors.keyword, fontWeight: '700' },
        { tag: tags.atom, color: colors.attribute },
        { tag: tags.bool, color: colors.attribute, fontWeight: '700' },
        { tag: tags.number, color: colors.attribute },
        { tag: tags.operator, color: colors.marker },
        { tag: tags.function(tags.variableName), color: colors.heading },
        { tag: tags.function(tags.propertyName), color: colors.heading },
        { tag: tags.typeName, color: colors.attribute, fontWeight: '700' },
        { tag: tags.className, color: colors.attribute, fontWeight: '700' },
        { tag: tags.definition(tags.variableName), color: colors.heading },
        { tag: tags.comment, color: colors.comment, fontStyle: 'italic' },
        { tag: tags.escape, color: colors.invalid, fontWeight: '700' },
        { tag: tags.invalid, color: colors.invalid, textDecoration: `underline wavy ${colors.invalid}` },
    ]);
}

export function getTokenColorExtension() {
    if (!state.editorTokenColorsEnabled) {
        return [];
    }
    return syntaxHighlighting(buildEditorMarkdownHighlight(state.editorTokenColors));
}

function applyEditorPlainTextColor() {
    const plainTextColor = state.editorTokenColors?.plain || getEditorDefaultTokenColors().plain;
    el.editorView?.style.setProperty('--editor-plain-text-color', plainTextColor);
}

export function applyEditorTokenColors() {
    state.editorTokenColors = normalizeTokenColors(state.editorTokenColors);
    applyEditorPlainTextColor();
    if (cmView) {
        cmView.dispatch({
            effects: tokenColorCompartment.reconfigure(getTokenColorExtension())
        });
    }
}

export function applyEditorBackgroundColor() {
    state.editorBackgroundColor = normalizeBackgroundColor(state.editorBackgroundColor);
    el.editorView?.style.setProperty('--editor-background-color', state.editorBackgroundColor);
    applyEditorPlainTextColor();
    const isDarkBackground = getRelativeLuminance(state.editorBackgroundColor) < 0.45;
    el.editorView?.style.setProperty(
        '--editor-gutter-background-color',
        isDarkBackground
            ? 'color-mix(in srgb, var(--editor-background-color) 88%, black 12%)'
            : 'color-mix(in srgb, var(--editor-background-color) 88%, white 12%)'
    );
    el.editorView?.style.setProperty(
        '--editor-gutter-text-color',
        isDarkBackground ? 'rgba(226, 232, 240, 0.62)' : 'rgba(31, 41, 55, 0.62)'
    );
    el.editorView?.style.setProperty(
        '--editor-gutter-border-color',
        isDarkBackground ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
    );
}

export function setEditorTheme(isDark) {
    if (cmView) {
        cmView.dispatch({
            effects: themeCompartment.reconfigure(isDark ? oneDark : [])
        });
    }
    state.editorTokenColors = normalizeTokenColors(state.editorTokenColors, isDark ? 'dark' : 'light');
    state.editorBackgroundColor = normalizeBackgroundColor(state.editorBackgroundColor, isDark ? 'dark' : 'light');
    applyEditorTokenColors();
    applyEditorBackgroundColor();
}

