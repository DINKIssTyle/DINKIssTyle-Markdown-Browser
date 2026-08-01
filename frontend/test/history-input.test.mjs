import test from 'node:test';
import assert from 'node:assert/strict';

import {
    HISTORY_BACK,
    HISTORY_FORWARD,
    HORIZONTAL_GESTURE_BLOCKED,
    HORIZONTAL_GESTURE_HISTORY,
    HORIZONTAL_GESTURE_SCROLL,
    createHorizontalSwipeTracker,
    horizontalGestureDisposition,
} from '../src/history-input.mjs';

function element({
    scrollWidth = 100,
    clientWidth = 100,
    scrollLeft = 0,
    overflowX = 'visible',
    overscrollBehaviorX = 'auto',
    parentElement = null,
} = {}) {
    return {
        nodeType: 1,
        scrollWidth,
        clientWidth,
        scrollLeft,
        overflowX,
        overscrollBehaviorX,
        parentElement,
    };
}

const mockStyle = node => ({
    overflowX: node.overflowX,
    overscrollBehaviorX: node.overscrollBehaviorX,
});

test('maps a rightward trackpad swipe to back navigation', () => {
    const tracker = createHorizontalSwipeTracker({ threshold: 100 });

    assert.deepEqual(tracker.update(-40, 2, 10), {
        cancelled: false,
        direction: HISTORY_BACK,
        progress: 0.4,
        ready: false,
    });
    assert.deepEqual(tracker.update(-65, 3, 20), {
        cancelled: false,
        direction: HISTORY_BACK,
        progress: 1,
        ready: true,
    });
});

test('maps a leftward trackpad swipe to forward navigation', () => {
    const tracker = createHorizontalSwipeTracker({ threshold: 100 });

    assert.equal(tracker.update(55, 4, 10).direction, HISTORY_FORWARD);
    assert.equal(tracker.update(50, 2, 20).ready, true);
});

test('cancels feedback when cumulative movement becomes vertical', () => {
    const tracker = createHorizontalSwipeTracker({ threshold: 100 });

    assert.equal(tracker.update(30, 80, 10).cancelled, true);
});

test('starts a fresh progress session after the gesture becomes idle', () => {
    const tracker = createHorizontalSwipeTracker({ threshold: 100, idleResetMs: 100 });

    assert.equal(tracker.update(-110, 0, 10).ready, true);
    const restarted = tracker.update(30, 0, 200);
    assert.equal(restarted.direction, HISTORY_FORWARD);
    assert.equal(restarted.progress, 0.3);
    assert.equal(restarted.ready, false);
});

test('reduces progress when the user reverses before releasing', () => {
    const tracker = createHorizontalSwipeTracker({ threshold: 100 });

    assert.equal(tracker.update(-80, 0, 10).progress, 0.8);
    const reversed = tracker.update(50, 0, 20);
    assert.equal(reversed.direction, HISTORY_BACK);
    assert.equal(reversed.progress, 0.3);
    assert.equal(reversed.ready, false);
});

test('ignores incidental layout overflow in a non-scroll container', () => {
    const layout = element({ scrollWidth: 110, clientWidth: 100, overflowX: 'visible' });

    assert.equal(
        horizontalGestureDisposition(layout, 50, mockStyle),
        HORIZONTAL_GESTURE_HISTORY,
    );
});

test('lets an explicit horizontal scroller consume a gesture when it can move', () => {
    const scroller = element({ scrollWidth: 300, clientWidth: 100, overflowX: 'auto' });

    assert.equal(
        horizontalGestureDisposition(scroller, 50, mockStyle),
        HORIZONTAL_GESTURE_SCROLL,
    );
});

test('hands overscroll at a scroller edge to history navigation', () => {
    const scroller = element({
        scrollWidth: 300,
        clientWidth: 100,
        scrollLeft: 200,
        overflowX: 'auto',
    });

    assert.equal(
        horizontalGestureDisposition(scroller, 50, mockStyle),
        HORIZONTAL_GESTURE_HISTORY,
    );
});

test('honours contained overscroll at a scroller edge', () => {
    const scroller = element({
        scrollWidth: 300,
        clientWidth: 100,
        scrollLeft: 200,
        overflowX: 'auto',
        overscrollBehaviorX: 'contain',
    });

    assert.equal(
        horizontalGestureDisposition(scroller, 50, mockStyle),
        HORIZONTAL_GESTURE_BLOCKED,
    );
});
