/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { Haptic } from '../bindings/dinkisstyle-markdown-browser/internal/app/app';

/**
 * Triggers haptic feedback on supported mobile devices (iOS / Android / WebKit / Web API).
 * @param {'light' | 'medium' | 'heavy' | 'selection'} [type='medium']
 */
export function triggerHaptic(type = 'medium') {
    try {
        if (typeof Haptic === 'function') {
            try {
                const res = Haptic(type);
                if (res && typeof res.catch === 'function') {
                    res.catch(() => {});
                }
            } catch (_) {}
        }

        const androidBridge = window;
        if (typeof androidBridge?.WailsBridge?.haptic === 'function') {
            androidBridge.WailsBridge.haptic(type === 'selection' ? 'selection' : `impact-${type}`);
            return;
        }
        if (typeof androidBridge?.dkstHaptic === 'function') {
            androidBridge.dkstHaptic(type);
            return;
        }

        const webkit = window?.webkit;
        if (typeof webkit?.messageHandlers?.haptic?.postMessage === 'function') {
            webkit.messageHandlers.haptic.postMessage({ type });
            return;
        }

        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            const ms = type === 'light' || type === 'selection' ? 12 : type === 'heavy' ? 35 : 20;
            navigator.vibrate(ms);
        }
    } catch (_) {
        // Ignore unsupported vibration environments
    }
}
