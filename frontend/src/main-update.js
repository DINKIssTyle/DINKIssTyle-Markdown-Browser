import { marked } from 'marked';

import { state, el } from './main-state.js';
import { openExternalURL } from './main-navigation.js';
import { showActionToast, showToast } from './main-ui.js';
import { CheckForUpdate, GetVersion } from '../wailsjs/go/app/App';
import {
    isAutomaticUpdateCheckDue,
    isSafeGitHubReleaseURL,
    normalizeUpdateInterval,
} from './update-schedule.mjs';

const ALLOWED_RELEASE_NOTE_TAGS = new Set([
    'A', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HR', 'LI', 'OL', 'P', 'PRE', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
]);
const REMOVE_RELEASE_NOTE_TAGS = new Set(['IFRAME', 'IMG', 'MATH', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG']);

let latestUpdateInfo = null;
let activeCheckPromise = null;
let openSettingsHandler = null;

export function bindUpdateEvents({ openSettings } = {}) {
    openSettingsHandler = openSettings || null;
    el.updateCheckNow?.addEventListener('click', () => {
        void performUpdateCheck({ automatic: false });
    });
    el.updateDownload?.addEventListener('click', () => {
        const downloadURL = latestUpdateInfo?.asset?.downloadUrl;
        if (!isSafeGitHubReleaseURL(downloadURL, { download: true })) {
            showToast('A download is not available for this platform.');
            return;
        }
        void openExternalURL(downloadURL);
    });
    el.updateReleasePage?.addEventListener('click', event => {
        event.preventDefault();
        const releaseURL = latestUpdateInfo?.releaseUrl;
        if (isSafeGitHubReleaseURL(releaseURL)) {
            void openExternalURL(releaseURL);
        }
    });
    el.updateReleaseNotes?.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!link) return;
        event.preventDefault();
        if (isSafeReleaseNoteLink(link.href)) {
            void openExternalURL(link.href);
        }
    });

    syncUpdateSettingsControls();
    void loadCurrentVersion();
}

export function syncUpdateSettingsControls() {
    if (el.updateCheckInterval) {
        el.updateCheckInterval.value = normalizeUpdateInterval(state.updateCheckInterval);
    }
    renderLastChecked(state.lastUpdateCheck);
    if (latestUpdateInfo) {
        renderUpdateInfo(latestUpdateInfo);
    }
}

export function collectUpdateSettingsFromControls() {
    state.updateCheckInterval = normalizeUpdateInterval(el.updateCheckInterval?.value);
}

export function runAutomaticUpdateCheck() {
    if (!isAutomaticUpdateCheckDue(state.updateCheckInterval, state.lastUpdateCheck)) {
        return Promise.resolve(null);
    }
    return performUpdateCheck({ automatic: true });
}

async function loadCurrentVersion() {
    try {
        const version = await GetVersion();
        if (el.updateCurrentVersion) {
            el.updateCurrentVersion.textContent = version || '—';
        }
    } catch {
        // The version will also be populated by a successful update check.
    }
}

async function performUpdateCheck({ automatic }) {
    if (activeCheckPromise) return activeCheckPromise;

    activeCheckPromise = (async () => {
        setCheckingState(true);
        try {
            const info = await CheckForUpdate();
            latestUpdateInfo = info;
            state.lastUpdateCheck = info.checkedAt || new Date().toISOString();
            renderUpdateInfo(info);

            if (automatic && info.available) {
                showActionToast(`Version ${info.latestVersion} is available.`, {
                    icon: 'system_update',
                    actionLabel: 'More',
                    onAction: () => openSettingsHandler?.('update'),
                    dismissible: true,
                });
            }
            return info;
        } catch (error) {
            if (!automatic) {
                renderUpdateError(error);
            }
            return null;
        } finally {
            setCheckingState(false);
            activeCheckPromise = null;
        }
    })();

    return activeCheckPromise;
}

function setCheckingState(checking) {
    if (el.updateCheckNow) {
        el.updateCheckNow.disabled = checking;
        el.updateCheckNow.classList.toggle('is-loading', checking);
        const label = el.updateCheckNow.querySelector('span:last-child');
        if (label) label.textContent = checking ? 'Checking for updates…' : 'Check for updates now';
    }
    if (checking) {
        setStatus('checking', 'Checking for updates…', 'Connecting to GitHub Releases.', 'progress_activity');
    }
}

function renderUpdateInfo(info) {
    if (el.updateCurrentVersion) el.updateCurrentVersion.textContent = info.currentVersion || '—';
    if (el.updateOnlineVersion) el.updateOnlineVersion.textContent = info.latestVersion || '—';
    renderLastChecked(info.checkedAt);
    renderReleaseNotes(info.releaseNotes || 'No release notes were provided.');

    const trustedReleaseURL = isSafeGitHubReleaseURL(info.releaseUrl);
    el.updateReleasePage?.classList.toggle('hidden', !trustedReleaseURL);
    if (el.updateReleasePage) {
        el.updateReleasePage.href = trustedReleaseURL ? info.releaseUrl : '#';
    }

    const hasDownload = info.available && isSafeGitHubReleaseURL(info.asset?.downloadUrl, { download: true });
    el.updateDownload?.classList.toggle('hidden', !hasDownload);
    if (el.updateDownload) {
        el.updateDownload.title = hasDownload ? info.asset.name : '';
    }

    if (info.available) {
        const message = hasDownload
            ? `${info.asset.name} is ready to download.`
            : 'A newer release exists, but no matching download was found for this platform.';
        setStatus('available', 'An update is available', message, 'new_releases');
    } else {
        setStatus('current', 'You’re up to date', 'This is the latest published version.', 'check_circle');
    }
}

function renderUpdateError(error) {
    setStatus(
        'error',
        'Couldn’t check for updates',
        error?.message || 'Check your internet connection and try again.',
        'error',
    );
}

function setStatus(kind, title, message, icon) {
    if (el.updateStatusCard) el.updateStatusCard.dataset.state = kind;
    if (el.updateStatusIcon) el.updateStatusIcon.textContent = icon;
    if (el.updateStatusTitle) el.updateStatusTitle.textContent = title;
    if (el.updateStatusMessage) el.updateStatusMessage.textContent = message;
}

function renderLastChecked(value) {
    if (!el.updateLastChecked) return;
    const date = value ? new Date(value) : null;
    el.updateLastChecked.textContent = date && Number.isFinite(date.getTime())
        ? `Last checked ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`
        : 'Not checked yet';
}

function renderReleaseNotes(markdown) {
    if (!el.updateReleaseNotes) return;
    const template = document.createElement('template');
    template.innerHTML = marked.parse(String(markdown || ''));

    Array.from(template.content.querySelectorAll('*')).forEach(node => {
        if (REMOVE_RELEASE_NOTE_TAGS.has(node.tagName)) {
            node.remove();
            return;
        }
        if (!ALLOWED_RELEASE_NOTE_TAGS.has(node.tagName)) {
            node.replaceWith(...node.childNodes);
            return;
        }

        const originalHref = node.tagName === 'A' ? node.getAttribute('href') : '';
        Array.from(node.attributes).forEach(attribute => node.removeAttribute(attribute.name));
        if (node.tagName === 'A') {
            if (isSafeReleaseNoteLink(originalHref)) {
                node.setAttribute('href', originalHref);
                node.setAttribute('rel', 'noopener noreferrer');
            } else {
                node.replaceWith(...node.childNodes);
            }
        }
    });

    el.updateReleaseNotes.replaceChildren(template.content);
}

function isSafeReleaseNoteLink(value) {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}
