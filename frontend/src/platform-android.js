import { Events } from '@wailsio/runtime';
import { shareOrDownloadDocument } from './platform-common.js';

function callAndroidBridge(method, ...args) {
    const bridge = window.wails;
    if (!bridge || typeof bridge[method] !== 'function') return false;
    bridge[method](...args);
    return true;
}

function saveWithAndroidDocumentPicker(filename, content) {
    if (!window.wails || typeof window.wails.saveDocumentAs !== 'function') {
        return null;
    }

    return new Promise((resolve, reject) => {
        let timeout = 0;
        const unsubscribe = Events.On('dkst:mobile-save-result', event => {
            window.clearTimeout(timeout);
            unsubscribe?.();
            let result = event.data || {};
            if (typeof result === 'string') {
                try {
                    result = JSON.parse(result);
                } catch {
                    result = { error: 'The Android save result was invalid.' };
                }
            }
            if (result.error) {
                reject(new Error(result.error));
                return;
            }
            resolve(!!result.saved);
        });
        timeout = window.setTimeout(() => {
            unsubscribe?.();
            reject(new Error('The Android document picker did not respond.'));
        }, 120000);
        callAndroidBridge('saveDocumentAs', filename, content);
    });
}

export function createAndroidPlatformAdapter() {
    return {
        initialize() {
            document.documentElement.classList.add('platform-android');
        },
        async print(desktopPrint) {
            if (!callAndroidBridge('printDocument')) {
                await desktopPrint();
            }
        },
        async saveDocumentAs(filename, content) {
            const saveResult = saveWithAndroidDocumentPicker(filename, content);
            if (saveResult) {
                // false means the user cancelled the native picker. Do not open a
                // second fallback dialog in that case.
                return saveResult;
            }
            return shareOrDownloadDocument(filename, content);
        },
    };
}
