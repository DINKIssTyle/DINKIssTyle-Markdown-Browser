/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

export const HISTORY_BACK = 'back';
export const HISTORY_FORWARD = 'forward';

export function createHorizontalSwipeTracker({
    threshold = 120,
    idleResetMs = 180,
    horizontalRatio = 1.25,
} = {}) {
    let accumulatedX = 0;
    let lastTimeStamp = Number.NEGATIVE_INFINITY;
    let triggered = false;

    function reset() {
        accumulatedX = 0;
        lastTimeStamp = Number.NEGATIVE_INFINITY;
        triggered = false;
    }

    function update(deltaX, deltaY, timeStamp) {
        const x = Number(deltaX) || 0;
        const y = Number(deltaY) || 0;
        const now = Number.isFinite(timeStamp) ? timeStamp : 0;

        if (now - lastTimeStamp > idleResetMs) {
            accumulatedX = 0;
            triggered = false;
        }
        lastTimeStamp = now;

        if (Math.abs(x) < 1 || Math.abs(x) < Math.abs(y) * horizontalRatio) {
            return null;
        }
        if (triggered) {
            return null;
        }

        accumulatedX += x;
        if (Math.abs(accumulatedX) < threshold) {
            return null;
        }

        triggered = true;
        return accumulatedX < 0 ? HISTORY_BACK : HISTORY_FORWARD;
    }

    return { reset, update };
}
