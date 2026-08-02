/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

export const HISTORY_BACK = 'back';
export const HISTORY_FORWARD = 'forward';
export const HORIZONTAL_GESTURE_HISTORY = 'history';
export const HORIZONTAL_GESTURE_SCROLL = 'scroll';
export const HORIZONTAL_GESTURE_BLOCKED = 'blocked';

const SCROLLABLE_OVERFLOW_VALUES = new Set(['auto', 'scroll', 'overlay']);
const CONTAINED_OVERSCROLL_VALUES = new Set(['contain', 'none']);

export function horizontalGestureDisposition(target, deltaX, getStyle) {
    if (!target || !deltaX || typeof getStyle !== 'function') {
        return HORIZONTAL_GESTURE_HISTORY;
    }

    let node = target.nodeType === 1 ? target : target.parentElement;
    while (node) {
        const style = getStyle(node);
        const overflowX = style?.overflowX || style?.overflow || 'visible';
        const overscrollX = style?.overscrollBehaviorX || style?.overscrollBehavior || 'auto';
        const maxScrollLeft = Number(node.scrollWidth) - Number(node.clientWidth);

        if (SCROLLABLE_OVERFLOW_VALUES.has(overflowX) && maxScrollLeft > 1) {
            const scrollLeft = Number(node.scrollLeft) || 0;
            const canConsume = deltaX < 0
                ? scrollLeft > 1
                : scrollLeft < maxScrollLeft - 1;
            if (canConsume) {
                return HORIZONTAL_GESTURE_SCROLL;
            }
            if (CONTAINED_OVERSCROLL_VALUES.has(overscrollX)) {
                return HORIZONTAL_GESTURE_BLOCKED;
            }
        }

        node = node.parentElement;
    }

    return HORIZONTAL_GESTURE_HISTORY;
}

export function createHorizontalSwipeTracker({
    threshold = 120,
    idleResetMs = 180,
    horizontalRatio = 1.25,
    readyReleaseRatio = 0.72,
    resetOnIdle = true,
} = {}) {
    let accumulatedX = 0;
    let accumulatedY = 0;
    let lastTimeStamp = Number.NEGATIVE_INFINITY;
    let latchedDirection = null;

    function reset() {
        accumulatedX = 0;
        accumulatedY = 0;
        lastTimeStamp = Number.NEGATIVE_INFINITY;
        latchedDirection = null;
    }

    function update(deltaX, deltaY, timeStamp) {
        const x = Number(deltaX) || 0;
        const y = Number(deltaY) || 0;
        const now = Number.isFinite(timeStamp) ? timeStamp : 0;

        if (resetOnIdle && !latchedDirection && now - lastTimeStamp > idleResetMs) {
            accumulatedX = 0;
            accumulatedY = 0;
        }
        lastTimeStamp = now;

        accumulatedX += x;
        accumulatedY += y;

        if (latchedDirection) {
            const retainedDistance = latchedDirection === HISTORY_BACK
                ? -accumulatedX
                : accumulatedX;
            if (retainedDistance >= threshold * readyReleaseRatio) {
                return {
                    cancelled: false,
                    direction: latchedDirection,
                    progress: 1,
                    ready: true,
                };
            }
            latchedDirection = null;
        }

        const horizontalDistance = Math.abs(accumulatedX);
        const verticalDistance = Math.abs(accumulatedY);
        if (horizontalDistance < 1) {
            return null;
        }
        if (verticalDistance > 8 && horizontalDistance < verticalDistance * horizontalRatio) {
            return {
                cancelled: true,
                direction: null,
                progress: 0,
                ready: false,
            };
        }

        const direction = accumulatedX < 0 ? HISTORY_BACK : HISTORY_FORWARD;
        const ready = horizontalDistance >= threshold;
        if (ready) {
            latchedDirection = direction;
        }

        return {
            cancelled: false,
            direction,
            progress: Math.min(horizontalDistance / threshold, 1),
            ready,
        };
    }

    return { reset, update };
}
