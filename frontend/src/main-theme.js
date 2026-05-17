export const DEFAULT_LIGHT_ACCENT_COLOR = '#0071e3';
export const DEFAULT_DARK_ACCENT_COLOR = '#0a84ff';

export const LIGHT_ACCENT_PRESETS = Object.freeze([
    '#0071e3',
    '#8f3fa3',
    '#ec4899',
    '#df2f3a',
    '#f97316',
    '#fbbc24',
    '#56b33f',
    '#8f8f8f',
]);

export const DARK_ACCENT_PRESETS = Object.freeze([
    '#0a84ff',
    '#c678dd',
    '#ff5da8',
    '#ff6b72',
    '#ff9f43',
    '#ffd166',
    '#7ddc68',
    '#b6b6b6',
]);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeAccentColor(value, fallback = DEFAULT_LIGHT_ACCENT_COLOR) {
    return HEX_COLOR_RE.test(value || '') ? value.toLowerCase() : fallback;
}

function hexToRgb(hex) {
    const value = normalizeAccentColor(hex).slice(1);
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map(channel => {
        const bounded = Math.max(0, Math.min(255, Math.round(channel)));
        return bounded.toString(16).padStart(2, '0');
    }).join('')}`;
}

function mixColor(color, target, amount) {
    const from = hexToRgb(color);
    const to = hexToRgb(target);
    return rgbToHex({
        r: from.r + (to.r - from.r) * amount,
        g: from.g + (to.g - from.g) * amount,
        b: from.b + (to.b - from.b) * amount,
    });
}

export function resolveAccentSettings(settings = {}) {
    return {
        light: normalizeAccentColor(settings.lightAccentColor, DEFAULT_LIGHT_ACCENT_COLOR),
        dark: normalizeAccentColor(settings.darkAccentColor, DEFAULT_DARK_ACCENT_COLOR),
    };
}

export function getCurrentAccentColor() {
    const computed = getComputedStyle(document.documentElement);
    return normalizeAccentColor(computed.getPropertyValue('--accent-color').trim(), DEFAULT_LIGHT_ACCENT_COLOR);
}

export function applyAccentColors(lightAccentColor, darkAccentColor) {
    const isDark = document.documentElement.classList.contains('dark');
    const color = normalizeAccentColor(
        isDark ? darkAccentColor : lightAccentColor,
        isDark ? DEFAULT_DARK_ACCENT_COLOR : DEFAULT_LIGHT_ACCENT_COLOR
    );
    const rgb = hexToRgb(color);
    const hover = mixColor(color, isDark ? '#ffffff' : '#000000', isDark ? 0.16 : 0.08);
    const gradientEnd = mixColor(color, isDark ? '#e6f4ff' : '#e0f7ff', isDark ? 0.46 : 0.38);

    const root = document.documentElement;
    root.style.setProperty('--accent-color', color);
    root.style.setProperty('--accent-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    root.style.setProperty('--accent-color-hover', hover);
    root.style.setProperty('--accent-color-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`);
    root.style.setProperty('--accent-color-softer', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
    root.style.setProperty('--accent-color-strong-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.20)`);
    root.style.setProperty('--accent-color-selected-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`);
    root.style.setProperty('--accent-color-border', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`);
    root.style.setProperty('--accent-color-ring', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`);
    root.style.setProperty('--accent-color-shadow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`);
    root.style.setProperty('--accent-gradient-start', color);
    root.style.setProperty('--accent-gradient-end', gradientEnd);
}
