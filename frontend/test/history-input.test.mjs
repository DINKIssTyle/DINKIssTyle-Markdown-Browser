import test from 'node:test';
import assert from 'node:assert/strict';

import {
    HISTORY_BACK,
    HISTORY_FORWARD,
    createHorizontalSwipeTracker,
} from '../src/history-input.mjs';

test('maps a rightward trackpad swipe to back navigation', () => {
    const tracker = createHorizontalSwipeTracker({ threshold: 100 });

    assert.equal(tracker.update(-40, 2, 10), null);
    assert.equal(tracker.update(-65, 3, 20), HISTORY_BACK);
});

test('maps a leftward trackpad swipe to forward navigation', () => {
    const tracker = createHorizontalSwipeTracker({ threshold: 100 });

    assert.equal(tracker.update(55, 4, 10), null);
    assert.equal(tracker.update(50, 2, 20), HISTORY_FORWARD);
});

test('ignores vertical scrolling and only fires once per gesture', () => {
    const tracker = createHorizontalSwipeTracker({ threshold: 100 });

    assert.equal(tracker.update(30, 80, 10), null);
    assert.equal(tracker.update(-110, 0, 20), HISTORY_BACK);
    assert.equal(tracker.update(-110, 0, 30), null);
});

test('allows another navigation after the gesture becomes idle', () => {
    const tracker = createHorizontalSwipeTracker({ threshold: 100, idleResetMs: 100 });

    assert.equal(tracker.update(-110, 0, 10), HISTORY_BACK);
    assert.equal(tracker.update(110, 0, 50), null);
    assert.equal(tracker.update(110, 0, 200), HISTORY_FORWARD);
});
