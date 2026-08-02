import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isAutomaticUpdateCheckDue,
    isSafeGitHubReleaseURL,
    normalizeUpdateInterval,
} from '../src/update-schedule.mjs';

const now = new Date('2026-08-02T12:00:00Z');

test('defaults an unknown update interval to weekly', () => {
    assert.equal(normalizeUpdateInterval(''), 'weekly');
    assert.equal(normalizeUpdateInterval('hourly'), 'weekly');
    assert.equal(normalizeUpdateInterval('monthly'), 'monthly');
});

test('never disables automatic update checks', () => {
    assert.equal(isAutomaticUpdateCheckDue('never', '', now), false);
    assert.equal(isAutomaticUpdateCheckDue('never', '2025-01-01T00:00:00Z', now), false);
});

test('checks when no prior successful check was recorded', () => {
    assert.equal(isAutomaticUpdateCheckDue('weekly', '', now), true);
    assert.equal(isAutomaticUpdateCheckDue('weekly', 'invalid', now), true);
});

test('respects daily, weekly, and thirty-day monthly intervals', () => {
    assert.equal(isAutomaticUpdateCheckDue('daily', '2026-08-01T11:59:59Z', now), true);
    assert.equal(isAutomaticUpdateCheckDue('daily', '2026-08-02T00:00:01Z', now), false);
    assert.equal(isAutomaticUpdateCheckDue('weekly', '2026-07-26T12:00:00Z', now), true);
    assert.equal(isAutomaticUpdateCheckDue('weekly', '2026-07-27T12:00:00Z', now), false);
    assert.equal(isAutomaticUpdateCheckDue('monthly', '2026-07-03T12:00:00Z', now), true);
});

test('accepts only this repository release and download URLs', () => {
    const release = 'https://github.com/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases/tag/v2.2.3';
    const download = 'https://github.com/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases/download/v2.2.3/app.dmg';

    assert.equal(isSafeGitHubReleaseURL(release), true);
    assert.equal(isSafeGitHubReleaseURL(download, { download: true }), true);
    assert.equal(isSafeGitHubReleaseURL('https://example.com/releases/tag/v2.2.3'), false);
    assert.equal(isSafeGitHubReleaseURL(release, { download: true }), false);
});
