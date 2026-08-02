export const UPDATE_INTERVALS = Object.freeze(['never', 'daily', 'weekly', 'monthly']);

const UPDATE_INTERVAL_MS = Object.freeze({
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
});

export function normalizeUpdateInterval(value) {
    return UPDATE_INTERVALS.includes(value) ? value : 'weekly';
}

export function isAutomaticUpdateCheckDue(interval, lastCheckedAt, now = new Date()) {
    const normalizedInterval = normalizeUpdateInterval(interval);
    if (normalizedInterval === 'never') return false;

    const lastCheckedTime = Date.parse(lastCheckedAt || '');
    if (!Number.isFinite(lastCheckedTime)) return true;

    return now.getTime() - lastCheckedTime >= UPDATE_INTERVAL_MS[normalizedInterval];
}

export function isSafeGitHubReleaseURL(value, { download = false } = {}) {
    try {
        const url = new URL(value);
        const prefix = '/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases/';
        return url.protocol === 'https:' &&
            url.hostname === 'github.com' &&
            url.pathname.startsWith(download ? `${prefix}download/` : prefix);
    } catch {
        return false;
    }
}
