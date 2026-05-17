/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

export function createCancelledTaskError(message = 'Task cancelled') {
    const error = new Error(message);
    error.name = 'TaskCancelledError';
    return error;
}

export function isCancellationError(error) {
    if (error?.name === 'TaskCancelledError') {
        return true;
    }
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('context canceled') ||
        message.includes('context cancelled') ||
        message.includes('task cancelled') ||
        message.includes('canceled');
}

export function throwIfQueuedTaskCancelled(isCancelled) {
    if (typeof isCancelled === 'function' && isCancelled()) {
        throw createCancelledTaskError();
    }
}
