/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { el, state } from './main-state.js';
import {
    LANGUAGE_CATALOG,
    MAX_REGISTERED_LANGUAGES,
    languagesForCodes,
    normalizeRegisteredLanguageCodes,
    searchLanguageCatalog,
} from './language-settings.mjs';

let draftLanguageCodes = [];
let draggedLanguageCode = '';
let languageEventsBound = false;

export function loadLanguageSettings(settings = {}) {
    state.languageCodes = normalizeRegisteredLanguageCodes(settings.languageCodes);
}

export function getConfiguredLanguages() {
    return languagesForCodes(state.languageCodes);
}

function makeIconButton(icon, label, action, code, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-language-action';
    button.dataset.languageAction = action;
    button.dataset.languageCode = code;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.disabled = disabled;

    const symbol = document.createElement('span');
    symbol.className = 'material-symbols-outlined';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = icon;
    button.appendChild(symbol);
    return button;
}

function makeLanguageIdentity(language) {
    const identity = document.createElement('span');
    identity.className = 'settings-language-identity';

    const title = document.createElement('strong');
    title.textContent = language.name;
    identity.appendChild(title);

    const detail = document.createElement('small');
    detail.textContent = `${language.nativeName} · ${language.code}`;
    identity.appendChild(detail);
    return identity;
}

function renderRegisteredLanguages() {
    if (!el.settingsLanguageList) return;
    const languages = languagesForCodes(draftLanguageCodes);
    el.settingsLanguageList.innerHTML = '';

    if (languages.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'settings-language-empty';
        empty.textContent = 'No languages registered. Search below to add one.';
        el.settingsLanguageList.appendChild(empty);
    } else {
        languages.forEach((language, index) => {
            const item = document.createElement('div');
            item.className = 'settings-language-item';
            item.dataset.languageCode = language.code;
            item.draggable = true;

            const handle = document.createElement('span');
            handle.className = 'material-symbols-outlined settings-language-drag';
            handle.setAttribute('aria-hidden', 'true');
            handle.textContent = 'unfold_more';
            item.appendChild(handle);
            item.appendChild(makeLanguageIdentity(language));

            const actions = document.createElement('span');
            actions.className = 'settings-language-actions';
            actions.appendChild(makeIconButton('keyboard_arrow_up', `Move ${language.name} up`, 'up', language.code, index === 0));
            actions.appendChild(makeIconButton('keyboard_arrow_down', `Move ${language.name} down`, 'down', language.code, index === languages.length - 1));
            actions.appendChild(makeIconButton('delete', `Remove ${language.name}`, 'remove', language.code));
            item.appendChild(actions);
            el.settingsLanguageList.appendChild(item);
        });
    }

    if (el.settingsLanguageCount) {
        el.settingsLanguageCount.textContent = `${languages.length} / ${MAX_REGISTERED_LANGUAGES}`;
    }
}

function renderLanguageSearchResults() {
    if (!el.settingsLanguageResults) return;
    const query = el.settingsLanguageSearch?.value || '';
    const results = searchLanguageCatalog(query, draftLanguageCodes).slice(0, 8);
    el.settingsLanguageResults.innerHTML = '';

    if (!query.trim()) {
        el.settingsLanguageResults.classList.add('hidden');
        if (el.settingsLanguageStatus) {
            el.settingsLanguageStatus.textContent = draftLanguageCodes.length >= MAX_REGISTERED_LANGUAGES
                ? 'The 10-language limit has been reached.'
                : 'Search by language name, native name, or locale code.';
        }
        return;
    }

    el.settingsLanguageResults.classList.remove('hidden');
    if (results.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'settings-language-search-empty';
        empty.textContent = 'No available languages found.';
        el.settingsLanguageResults.appendChild(empty);
    } else {
        const atLimit = draftLanguageCodes.length >= MAX_REGISTERED_LANGUAGES;
        results.forEach(language => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'settings-language-result';
            button.dataset.languageAction = 'add';
            button.dataset.languageCode = language.code;
            button.disabled = atLimit;
            button.appendChild(makeLanguageIdentity(language));

            const addLabel = document.createElement('span');
            addLabel.className = 'settings-language-add-label';
            addLabel.textContent = 'Add';
            button.appendChild(addLabel);
            el.settingsLanguageResults.appendChild(button);
        });
    }

    if (el.settingsLanguageStatus) {
        el.settingsLanguageStatus.textContent = draftLanguageCodes.length >= MAX_REGISTERED_LANGUAGES
            ? 'Remove a language before adding another.'
            : `${results.length} matching language${results.length === 1 ? '' : 's'}`;
    }
}

function commitDraftChange(nextCodes) {
    draftLanguageCodes = normalizeRegisteredLanguageCodes(nextCodes, []);
    renderRegisteredLanguages();
    renderLanguageSearchResults();
    if (el.settingsLanguageCodes) {
        el.settingsLanguageCodes.value = JSON.stringify(draftLanguageCodes);
        el.settingsLanguageCodes.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function moveLanguage(code, offset) {
    const currentIndex = draftLanguageCodes.indexOf(code);
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= draftLanguageCodes.length) return;
    const nextCodes = [...draftLanguageCodes];
    [nextCodes[currentIndex], nextCodes[nextIndex]] = [nextCodes[nextIndex], nextCodes[currentIndex]];
    commitDraftChange(nextCodes);
    el.settingsLanguageList
        ?.querySelector(`[data-language-action="remove"][data-language-code="${CSS.escape(code)}"]`)
        ?.focus();
}

function handleLanguageAction(event) {
    const target = event.target.closest('[data-language-action]');
    if (!target || target.disabled) return;
    const code = target.dataset.languageCode;
    switch (target.dataset.languageAction) {
        case 'add':
            if (draftLanguageCodes.length >= MAX_REGISTERED_LANGUAGES || !LANGUAGE_CATALOG.some(item => item.code === code)) return;
            commitDraftChange([...draftLanguageCodes, code]);
            if (el.settingsLanguageSearch) {
                el.settingsLanguageSearch.value = '';
                el.settingsLanguageSearch.focus();
            }
            renderLanguageSearchResults();
            break;
        case 'remove':
            commitDraftChange(draftLanguageCodes.filter(item => item !== code));
            break;
        case 'up':
            moveLanguage(code, -1);
            break;
        case 'down':
            moveLanguage(code, 1);
            break;
    }
}

export function syncLanguageSettingsControls() {
    draftLanguageCodes = normalizeRegisteredLanguageCodes(state.languageCodes);
    if (el.settingsLanguageSearch) el.settingsLanguageSearch.value = '';
    if (el.settingsLanguageCodes) el.settingsLanguageCodes.value = JSON.stringify(draftLanguageCodes);
    renderRegisteredLanguages();
    renderLanguageSearchResults();
}

export function collectLanguageSettingsFromControls() {
    state.languageCodes = normalizeRegisteredLanguageCodes(draftLanguageCodes, []);
}

export function bindLanguageSettingsEvents() {
    if (languageEventsBound) return;
    languageEventsBound = true;

    el.settingsLanguageSearch?.addEventListener('input', renderLanguageSearchResults);
    el.settingsLanguageList?.addEventListener('click', handleLanguageAction);
    el.settingsLanguageResults?.addEventListener('click', handleLanguageAction);

    el.settingsLanguageList?.addEventListener('dragstart', event => {
        const item = event.target.closest('.settings-language-item');
        if (!item) return;
        draggedLanguageCode = item.dataset.languageCode || '';
        item.classList.add('is-dragging');
        event.dataTransfer?.setData('text/plain', draggedLanguageCode);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    el.settingsLanguageList?.addEventListener('dragover', event => {
        if (!draggedLanguageCode || !event.target.closest('.settings-language-item')) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    el.settingsLanguageList?.addEventListener('drop', event => {
        const targetItem = event.target.closest('.settings-language-item');
        if (!targetItem || !draggedLanguageCode) return;
        event.preventDefault();
        const fromIndex = draftLanguageCodes.indexOf(draggedLanguageCode);
        const toIndex = draftLanguageCodes.indexOf(targetItem.dataset.languageCode);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
        const nextCodes = [...draftLanguageCodes];
        const [moved] = nextCodes.splice(fromIndex, 1);
        nextCodes.splice(toIndex, 0, moved);
        commitDraftChange(nextCodes);
    });
    el.settingsLanguageList?.addEventListener('dragend', () => {
        draggedLanguageCode = '';
        el.settingsLanguageList?.querySelectorAll('.is-dragging').forEach(item => item.classList.remove('is-dragging'));
    });
}
