import { System } from '@wailsio/runtime';

const SUPPORTED_PLATFORMS = new Set(['ios', 'android', 'darwin', 'windows', 'linux']);

function detectPlatform() {
    const previewPlatform = new URLSearchParams(window.location.search).get('platform');
    if (SUPPORTED_PLATFORMS.has(previewPlatform)) {
        return previewPlatform;
    }

    const runtimePlatform = window._wails?.environment?.OS;
    if (SUPPORTED_PLATFORMS.has(runtimePlatform)) {
        return runtimePlatform;
    }

    if (System.IsIOS()) return 'ios';
    if (System.IsAndroid()) return 'android';

    const userAgent = navigator.userAgent || '';
    if (/android/i.test(userAgent)) return 'android';
    if (/ipad|iphone|ipod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        return 'ios';
    }
    return 'desktop';
}

export const platform = detectPlatform();
export const isIOSPlatform = () => platform === 'ios';
export const isAndroidPlatform = () => platform === 'android';
export const isMobilePlatform = () => isIOSPlatform() || isAndroidPlatform();
export const MOBILE_UNTITLED_PATH = '__mobile_untitled__/Untitled.md';
export const isMobileUntitledPath = path => String(path || '').startsWith('__mobile_untitled__/');

let platformAdapter = null;

function disablePinchZoom() {
    // Prevent iOS WKWebView gesture zooming
    document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
    document.addEventListener('gestureend', e => e.preventDefault(), { passive: false });

    // Prevent multi-touch pinch zoom
    document.addEventListener('touchmove', e => {
        if (e.touches && e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false });

    // Prevent Ctrl + Wheel zoom (trackpad pinch on laptops)
    document.addEventListener('wheel', e => {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }, { passive: false });
}

export async function initializePlatform() {
    const root = document.documentElement;
    root.dataset.platform = platform;
    root.classList.add(`platform-${platform}`);
    root.classList.toggle('platform-mobile', isMobilePlatform());

    disablePinchZoom();

    if (!isMobilePlatform()) return;

    setupVisualViewport();
    setupTouchFeedback();

    if (isIOSPlatform()) {
        platformAdapter = (await import('./platform-ios.js')).createIOSPlatformAdapter();
    } else {
        platformAdapter = (await import('./platform-android.js')).createAndroidPlatformAdapter();
    }
    platformAdapter.initialize?.();
}

export async function printForCurrentPlatform(desktopPrint) {
    if (!isMobilePlatform()) {
        return desktopPrint();
    }
    return platformAdapter?.print?.(desktopPrint);
}

export async function saveDocumentAsForCurrentPlatform(filename, content) {
    if (!isMobilePlatform()) return false;
    if (platformAdapter?.saveDocumentAs) {
        return platformAdapter.saveDocumentAs(filename, content);
    }
    return shareOrDownloadDocument(filename, content);
}

export async function openExternalURLForCurrentPlatform(url, desktopOpen) {
    return desktopOpen();
}

export async function shareOrDownloadDocument(filename, content) {
    const safeName = String(filename || 'Untitled.md').replace(/[\\/:*?"<>|]+/g, '-');
    const file = new File([content], safeName, { type: 'text/markdown;charset=utf-8' });

    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        // Omit title/text so iOS/iPadOS WebKit shares ONLY the single file object, preventing duplicate title text file creation on save.
        await navigator.share({ files: [file] });
        return true;
    }

    const url = URL.createObjectURL(file);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = safeName;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return true;
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

function setupVisualViewport() {
    const viewport = window.visualViewport;
    const root = document.documentElement;

    const update = () => {
        const height = viewport?.height || window.innerHeight;
        const offsetTop = viewport?.offsetTop || 0;
        const keyboardHeight = Math.max(0, window.innerHeight - height - offsetTop);
        root.style.setProperty('--mobile-viewport-height', `${height}px`);
        root.style.setProperty('--mobile-viewport-top', `${offsetTop}px`);
        root.style.setProperty('--mobile-keyboard-height', `${keyboardHeight}px`);
        root.classList.toggle('mobile-keyboard-visible', keyboardHeight > 100);
    };

    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('orientationchange', () => window.setTimeout(update, 80));
}

function setupTouchFeedback() {
    const selector = 'button, a[href], [role="button"], .recent-item, .result-item, .file-tree-item, .outline-item, .nav-btn, .tool-btn, .tab-item, .action-btn, .modal-btn, .sidebar-tab-btn';
    let pressed = null;

    const release = () => {
        if (!pressed) return;
        const target = pressed;
        target.classList.remove('is-touch-pressed');
        target.classList.add('is-touch-releasing');
        pressed = null;

        window.setTimeout(() => {
            target.classList.remove('is-touch-releasing');
        }, 340);
    };

    document.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse') return;
        release();
        pressed = event.target.closest(selector);
        if (pressed) {
            pressed.classList.remove('is-touch-releasing');
            pressed.classList.add('is-touch-pressed');
        }
    }, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener('scroll', release, true);
}
