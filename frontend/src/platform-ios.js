import { shareOrDownloadDocument } from './platform-common.js';

export function createIOSPlatformAdapter() {
    return {
        initialize() {
            document.documentElement.classList.add('platform-ios');
        },
        print(desktopPrint) {
            // The iOS-specific Go implementation presents UIPrintInteractionController.
            return desktopPrint();
        },
        saveDocumentAs(filename, content) {
            // The share sheet includes “Save to Files” on iPadOS/iOS.
            return shareOrDownloadDocument(filename, content);
        },
    };
}
