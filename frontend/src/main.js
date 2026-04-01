/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import './style.css';

import { marked } from 'marked';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkHtml from 'remark-html';

import { OpenFile, ReadFile, SearchMarkdown, GetRecentFiles, ClearRecentFiles, OpenDirectory, HandleFileDrop, GetSettings, SaveSettings } from '../wailsjs/go/main/App';

// ── State ──────────────────────────────────────────────
let currentFilePath = "";
let currentFolder   = "";
// navHistory stores { path: string, scroll: number }
let navHistory      = [];
let navIndex        = -1;
let homeFilePath    = "";
let currentFontSize = 16;
let currentEngine   = "marked";

// Content scroller element (the article that overflows)
const getScroller = () => document.getElementById('content-view');

// Save the current scroll position into the history entry we're leaving
function saveCurrentScroll() {
    if (navIndex >= 0 && navIndex < navHistory.length) {
        navHistory[navIndex].scroll = getScroller().scrollTop;
    }
}

// ── DOM refs ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = {
    currentPath:       $('current-path'),
    homeScreen:        $('home-screen'),
    recentList:        $('recent-files-list'),
    markdownContainer: $('markdown-container'),
    searchSidebar:     $('search-sidebar'),
    searchInput:       $('search-input'),
    searchResults:     $('search-results'),
    selectEngine:      $('select-engine'),
    btnBack:           $('btn-back'),
    btnForward:        $('btn-forward'),
    btnHome:           $('btn-home'),
    btnOpen:           $('btn-open'),
    btnOpenHome:       $('btn-open-home'),
    btnClearRecent:    $('btn-clear-recent'),
    btnFontMinus:      $('btn-font-minus'),
    btnFontPlus:       $('btn-font-plus'),
    btnThemeToggle:    $('btn-theme-toggle'),
    btnSearchToggle:   $('btn-search-toggle'),
    btnSearchFolder:   $('btn-search-folder'),
};

// ── Boot ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await renderRecentFiles();
    bindToolbar();
    bindHomeScreen();
    setupDragAndDrop();
});

// ── Settings ───────────────────────────────────────────
async function loadSettings() {
    const s = await GetSettings();
    currentFontSize = s.fontSize  || 16;
    currentEngine   = s.engine    || "marked";

    document.documentElement.classList.toggle('dark', s.theme !== "light");
    el.selectEngine.value = currentEngine;
}

async function persist() {
    await SaveSettings({
        theme:    document.documentElement.classList.contains('dark') ? "dark" : "light",
        fontSize: currentFontSize,
        engine:   currentEngine,
    });
}

// ── Recent files ───────────────────────────────────────
async function renderRecentFiles() {
    const files = await GetRecentFiles();
    if (!files || files.length === 0) {
        el.recentList.innerHTML = '<div class="empty-state">최근에 열거나 드래그한 파일이 없습니다.</div>';
        return;
    }
    el.recentList.innerHTML = files.map(f => `
        <div class="recent-item" data-path="${f.path}">
            <span class="recent-name">${f.name}</span>
            <span class="recent-path">${f.path}</span>
        </div>
    `).join('');
}

// ── Toolbar bindings ───────────────────────────────────
function bindToolbar() {
    el.btnOpen.onclick        = handleOpenFile;
    el.btnBack.onclick        = goBack;
    el.btnForward.onclick     = goForward;
    el.btnHome.onclick        = goHome;
    el.btnFontMinus.onclick   = () => changeFontSize(-2);
    el.btnFontPlus.onclick    = () => changeFontSize(2);
    el.btnThemeToggle.onclick = toggleTheme;
    el.btnSearchToggle.onclick= toggleSearch;
    el.btnSearchFolder.onclick= handleOpenFolder;
    el.selectEngine.onchange  = e => { currentEngine = e.target.value; persist(); if (currentFilePath) reloadCurrent(); };
    el.searchInput.addEventListener('input', debounce(handleSearch, 300));
}

// ── Home screen bindings ───────────────────────────────
function bindHomeScreen() {
    // "Open File" button on home screen
    el.btnOpenHome.onclick = handleOpenFile;

    // "Clear recent" button
    el.btnClearRecent.onclick = async () => {
        await ClearRecentFiles();
        await renderRecentFiles();
    };

    // Click on recent item → open that file (event delegation)
    el.recentList.addEventListener('click', e => {
        const item = e.target.closest('.recent-item');
        if (item) openPath(item.dataset.path);
    });

    // Search results click (event delegation)
    el.searchResults.addEventListener('click', e => {
        const item = e.target.closest('.recent-item');
        if (item) openPath(item.dataset.path);
    });
}

// ── File open / load ───────────────────────────────────
async function handleOpenFile() {
    const result = await OpenFile();
    if (result && result.path) loadFile(result.path, result.content);
}

async function openPath(path, pushHistory = true) {
    try {
        const content = await ReadFile(path);
        loadFile(path, content, pushHistory);
    } catch (e) {
        console.error("openPath failed:", e);
    }
}

function loadFile(path, content, pushHistory = true) {
    currentFilePath = path;
    currentFolder   = path.substring(0, path.lastIndexOf('/'));
    if (!homeFilePath) homeFilePath = path;

    if (pushHistory) {
        // Save scroll of the page we're leaving before pushing new entry
        saveCurrentScroll();
        // Truncate forward stack
        if (navIndex < navHistory.length - 1) navHistory = navHistory.slice(0, navIndex + 1);
        navHistory.push({ path, scroll: 0 });
        navIndex++;
    }
    // else: back/forward — scroll will be restored AFTER render

    updateNavButtons();
    renderMarkdown(content).then(() => {
        if (pushHistory) {
            // New page → always start at top
            getScroller().scrollTop = 0;
        } else {
            // History navigation → restore saved scroll
            const saved = navHistory[navIndex]?.scroll ?? 0;
            getScroller().scrollTop = saved;
        }
    });

    el.currentPath.innerText = path;
    el.homeScreen.classList.add('hidden');
    el.markdownContainer.classList.remove('hidden');
}

async function reloadCurrent() {
    if (!currentFilePath) return;
    const content = await ReadFile(currentFilePath);
    renderMarkdown(content);
}

// ── Navigation ─────────────────────────────────────────
function goBack() {
    if (navIndex > 0) {
        saveCurrentScroll();
        navIndex--;
        openPath(navHistory[navIndex].path, false);
    }
}
function goForward() {
    if (navIndex < navHistory.length - 1) {
        saveCurrentScroll();
        navIndex++;
        openPath(navHistory[navIndex].path, false);
    }
}
function goHome() {
    if (homeFilePath) openPath(homeFilePath);
}
function updateNavButtons() {
    el.btnBack.disabled    = navIndex <= 0;
    el.btnForward.disabled = navIndex >= navHistory.length - 1;
}

// ── Markdown rendering ─────────────────────────────────
async function renderMarkdown(content) {
    let html;
    if (currentEngine === "marked") {
        html = marked.parse(content);
    } else {
        const vf = await unified().use(remarkParse).use(remarkHtml).process(content);
        html = String(vf);
    }
    el.markdownContainer.innerHTML = html;
    postProcess();
}

function postProcess() {
    // Intercept relative links
    el.markdownContainer.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('#')) {
            a.addEventListener('click', e => { e.preventDefault(); resolveLink(href); });
        }
    });

    // Rewrite relative image src
    el.markdownContainer.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
            const abs = src.startsWith('/') ? src : currentFolder + '/' + src;
            img.src = `http://wails.localhost/localfile${abs}`;
        }
    });

    el.markdownContainer.style.fontSize = `${currentFontSize}px`;
}

function resolveLink(rel) {
    if (rel.startsWith('/')) { openPath(rel); return; }
    const parts = currentFolder.split('/');
    for (const p of rel.split('/')) {
        if (p === '..')  { if (parts.length > 1) parts.pop(); }
        else if (p !== '.') parts.push(p);
    }
    openPath(parts.join('/'));
}

// ── Font / Theme / Search ──────────────────────────────
function changeFontSize(d) {
    currentFontSize = Math.min(72, Math.max(10, currentFontSize + d));
    el.markdownContainer.style.fontSize = `${currentFontSize}px`;
    persist();
}

function toggleTheme() { document.documentElement.classList.toggle('dark'); persist(); }

function toggleSearch() { el.searchSidebar.classList.toggle('hidden'); }

async function handleOpenFolder() {
    const path = await OpenDirectory();
    if (path) {
        currentFolder = path;
        el.searchResults.innerHTML = `<div class="search-hint">📁 ${path}</div>`;
    }
}

async function handleSearch() {
    const q = el.searchInput.value.trim();
    if (!q || !currentFolder) { el.searchResults.innerHTML = '<div class="search-hint">검색어와 폴더를 확인하세요.</div>'; return; }
    el.searchResults.innerHTML = '<div class="search-hint">검색 중…</div>';
    const results = await SearchMarkdown(currentFolder, q);
    if (!results || results.length === 0) {
        el.searchResults.innerHTML = '<div class="search-hint">결과 없음</div>';
        return;
    }
    el.searchResults.innerHTML = results.map(r => `
        <div class="recent-item" data-path="${r.path}">
            <span class="recent-name">${r.name}</span>
            <span class="recent-path">${r.path}</span>
        </div>
    `).join('');
}

// ── Drag & Drop ────────────────────────────────────────
function setupDragAndDrop() {
    window.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    window.addEventListener('drop', async e => {
        e.preventDefault(); e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (!file || !file.path) return;
        try {
            const result = await HandleFileDrop(file.path);
            if (result && result.path) loadFile(result.path, result.content);
        } catch (err) { console.error(err); }
    });
}

// ── Helpers ────────────────────────────────────────────
function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
