import { Browser, Clipboard, Events } from '@wailsio/runtime';

export function EventsOn(name, callback) {
    return Events.On(name, event => callback(event.data));
}

export function OnFileDrop(callback) {
    document.documentElement.setAttribute('data-file-drop-target', '');
    return Events.On('wails:file-drop', event => {
        const payload = event.data || {};
        callback(payload.x || 0, payload.y || 0, payload.files || []);
    });
}

export function BrowserOpenURL(url) {
    return Browser.OpenURL(url);
}

export function ClipboardGetText() {
    return Clipboard.Text();
}

export function ClipboardSetText(text) {
    return Clipboard.SetText(text);
}

let logClientMessageFn = null;
import('../bindings/dinkisstyle-markdown-browser/internal/app/app').then(module => {
    if (module?.LogClientMessage) {
        logClientMessageFn = module.LogClientMessage;
    }
}).catch(() => {});

export function LogError(message) {
    console.error(message);
    try {
        logClientMessageFn?.('error', String(message));
    } catch (_) {}
}

export function LogInfo(message) {
    console.info(message);
    try {
        logClientMessageFn?.('info', String(message));
    } catch (_) {}
}
