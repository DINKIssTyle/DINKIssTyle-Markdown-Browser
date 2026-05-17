/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { el } from './main-state.js';

export function resetModalContent() {
    el.modalInputGroup?.classList.add('hidden');
    el.modalOptionGrid?.classList.add('hidden');
    el.modalEmojiGrid?.classList.add('hidden');
    el.modalEmojiContainer?.classList.add('hidden');
    el.modalTableContainer?.classList.add('hidden');
    el.modalLanguageContainer?.classList.add('hidden');
    el.modalBtnOk?.classList.remove('hidden');
}

export function showTextPrompt(title, message, defaultValue = "", { select = false } = {}) {
    return new Promise((resolve) => {
        resetModalContent();
        el.modalTitle.textContent = title;
        el.modalMessage.textContent = message;
        el.modalInput.value = defaultValue;
        el.modalInputGroup.classList.remove('hidden');
        el.modalOverlay.classList.remove('hidden');

        const handleOk = () => {
            const value = el.modalInput.value;
            cleanup();
            resolve(value);
        };
        const handleCancel = () => {
            cleanup();
            resolve(null);
        };
        const handleKey = event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleOk();
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel();
            }
        };
        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            el.modalBtnOk.removeEventListener('click', handleOk);
            el.modalBtnCancel.removeEventListener('click', handleCancel);
            el.modalInput.removeEventListener('keydown', handleKey);
        };

        el.modalBtnOk.addEventListener('click', handleOk);
        el.modalBtnCancel.addEventListener('click', handleCancel);
        el.modalInput.addEventListener('keydown', handleKey);
        setTimeout(() => {
            el.modalInput.focus();
            if (select) {
                el.modalInput.select();
            }
        }, 50);
    });
}
