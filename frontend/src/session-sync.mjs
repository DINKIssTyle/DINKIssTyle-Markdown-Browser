import { collectUnsavedSessions } from './tab-sessions.mjs';

// Transport is injected so session delivery has no dependency on the editor or DOM.
export function createSessionSynchronizer({ getState, sendSessions, onError, initialRevision = Date.now() * 1000 }) {
    let revision = initialRevision;
    let lastJSON;

    return function syncEditorStateToBackend() {
        const sessions = collectUnsavedSessions(getState());
        const json = JSON.stringify(sessions);
        if (json === lastJSON) return;
        lastJSON = json;
        const sentRevision = ++revision;
        const failed = error => {
            if (revision === sentRevision) lastJSON = undefined;
            onError(error);
        };
        try {
            return Promise.resolve(sendSessions(sentRevision, sessions)).catch(failed);
        } catch (error) {
            failed(error);
        }
    };
}
