import { state } from './main-state.js';
import { SyncEditorSessions } from '../bindings/dinkisstyle-markdown-browser/internal/app/app';
import { LogError } from './wails-runtime';
import { createSessionSynchronizer } from './session-sync.mjs';

export const syncEditorStateToBackend = createSessionSynchronizer({
    getState: () => state,
    sendSessions: SyncEditorSessions,
    onError: error => LogError(`SyncEditorSessions failed: ${error}`),
});
