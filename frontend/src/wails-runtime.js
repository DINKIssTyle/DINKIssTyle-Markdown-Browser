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

export function LogError(message) {
    console.error(message);
}

export function LogInfo(message) {
    console.info(message);
}
