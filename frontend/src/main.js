/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import './style.css';

import { marked } from 'marked';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkHtml from 'remark-html';

import { OpenFile, ReadFile, SearchMarkdown, GetRecentFiles, ClearRecentFiles, HandleFileDrop, GetSettings, SaveSettings } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';

// ── State ──────────────────────────────────────────────
const HOME_SCREEN_PATH = '__home__';
const THIRD_PARTY_NOTICES_PATH = '/THIRD-PARTY-NOTICES.md';

let currentFilePath = "";
let currentFolder   = "";
// navHistory stores { path: string, scroll: number }
let navHistory      = [];
let navIndex        = -1;
let homeTargetPath  = HOME_SCREEN_PATH;
let currentFontSize = 16;
let currentEngine   = "marked";

// ── Highlight navigator state ──────────────────────────
let hlMatches        = [];   // NodeList → Array of <mark> elements
let hlCurrent        = -1;   // 현재 포커스 인덱스
let pendingKeyword   = "";   // 파일 로드 후 하이라이트할 키워드

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
    btnInfo:           $('btn-info'),
    btnFontMinus:      $('btn-font-minus'),
    btnFontPlus:       $('btn-font-plus'),
    btnThemeToggle:    $('btn-theme-toggle'),
    btnSearchToggle:   $('btn-search-toggle'),
    // Highlight navigator
    highlightNav:      $('highlight-nav'),
    btnHlPrev:         $('btn-hl-prev'),
    btnHlNext:         $('btn-hl-next'),
    btnHlClose:        $('btn-hl-close'),
    hlCounter:         $('hl-counter'),
    // Toast
    toast:             $('toast'),
};

// ── Boot ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await renderRecentFiles();
    bindToolbar();
    bindHomeScreen();
    bindHighlightNav();
    setupDragAndDrop();
    bindMenuEvents(); // macOS 메뉴바 이벤트 수신
    showHomeScreen(false);
    navHistory = [{ path: HOME_SCREEN_PATH, scroll: 0 }];
    navIndex = 0;
    updateNavButtons();
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
        el.recentList.innerHTML = '<div class="empty-state">No recently opened files.</div>';
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
    el.btnInfo.onclick        = openThirdPartyNotices;
    el.btnFontMinus.onclick   = () => changeFontSize(-2);
    el.btnFontPlus.onclick    = () => changeFontSize(2);
    el.btnThemeToggle.onclick = toggleTheme;
    el.btnSearchToggle.onclick= toggleSearch;
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
        if (item) openPath(item.dataset.path, true, true);
    });

    // 검색 결과 클릭 → 파일 열기 + 해당 키워드로 이동
    el.searchResults.addEventListener('click', e => {
        const item = e.target.closest('.result-item');
        if (!item) return;
        const path = item.dataset.path;
        const keyword = item.dataset.keyword;
        pendingKeyword = keyword || "";
        openPath(path, true, false);
    });
}

// ── File open / load ───────────────────────────────────
async function handleOpenFile() {
    const result = await OpenFile();
    if (result && result.path) loadFile(result.path, result.content, true, true);
}

async function openPath(path, pushHistory = true, setHome = false) {
    try {
        if (path === HOME_SCREEN_PATH) {
            await showHomeScreen(pushHistory);
            return;
        }
        if (path === THIRD_PARTY_NOTICES_PATH) {
            const content = await loadBundledMarkdown(path);
            loadFile(path, content, pushHistory, false);
            return;
        }
        const content = await ReadFile(path);
        loadFile(path, content, pushHistory, setHome);
    } catch (e) {
        console.error("openPath failed:", e);
    }
}

async function openThirdPartyNotices() {
    await openPath(THIRD_PARTY_NOTICES_PATH);
}

async function loadBundledMarkdown(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load bundled markdown: ${path}`);
    }
    return await response.text();
}

function loadFile(path, content, pushHistory = true, setHome = false) {
    currentFilePath = path;
    currentFolder   = path.substring(0, path.lastIndexOf('/'));

    if (setHome && path !== THIRD_PARTY_NOTICES_PATH) {
        homeTargetPath = path;
    }

    if (pushHistory) {
        saveCurrentScroll();
        if (navIndex < navHistory.length - 1) navHistory = navHistory.slice(0, navIndex + 1);
        navHistory.push({ path, scroll: 0 });
        navIndex++;
    }

    updateNavButtons();
    renderMarkdown(content).then(() => {
        if (pushHistory) {
            getScroller().scrollTop = 0;
        } else {
            const saved = navHistory[navIndex]?.scroll ?? 0;
            getScroller().scrollTop = saved;
        }

        // 검색 결과에서 넘어온 경우 키워드 하이라이트
        if (pendingKeyword) {
            const kw = pendingKeyword;
            pendingKeyword = "";
            applyHighlight(kw);
        } else {
            clearHighlight();
        }
    });

    el.currentPath.innerText = formatDisplayPath(path);
    el.homeScreen.classList.add('hidden');
    el.markdownContainer.classList.remove('hidden');
}

async function showHomeScreen(pushHistory = true) {
    currentFilePath = HOME_SCREEN_PATH;
    currentFolder = "";
    pendingKeyword = "";
    clearHighlight();

    if (pushHistory) {
        saveCurrentScroll();
        if (navIndex < navHistory.length - 1) navHistory = navHistory.slice(0, navIndex + 1);
        navHistory.push({ path: HOME_SCREEN_PATH, scroll: 0 });
        navIndex++;
    }

    await renderRecentFiles();
    updateNavButtons();
    el.currentPath.innerText = formatDisplayPath(HOME_SCREEN_PATH);
    el.markdownContainer.classList.add('hidden');
    el.homeScreen.classList.remove('hidden');

    if (pushHistory) {
        getScroller().scrollTop = 0;
    } else {
        const saved = navHistory[navIndex]?.scroll ?? 0;
        getScroller().scrollTop = saved;
    }
}

async function reloadCurrent() {
    if (!currentFilePath) return;
    if (currentFilePath === HOME_SCREEN_PATH) {
        await showHomeScreen(false);
        return;
    }
    if (currentFilePath === THIRD_PARTY_NOTICES_PATH) {
        const content = await loadBundledMarkdown(currentFilePath);
        renderMarkdown(content);
        return;
    }
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
    openPath(homeTargetPath);
}
function updateNavButtons() {
    el.btnBack.disabled    = navIndex <= 0;
    el.btnForward.disabled = navIndex >= navHistory.length - 1;
}

function formatDisplayPath(path) {
    if (path === HOME_SCREEN_PATH) {
        return 'DKST Markdown Browser';
    }
    if (path === THIRD_PARTY_NOTICES_PATH) {
        return 'THIRD-PARTY-NOTICES.md';
    }
    return path;
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

// ── Search ─────────────────────────────────────────────
async function handleSearch() {
    const q = el.searchInput.value.trim();
    if (!q || !currentFolder) {
        el.searchResults.innerHTML = '<div class="search-hint">Type a search keyword and keep a file open.</div>';
        return;
    }
    el.searchResults.innerHTML = '<div class="search-hint">Searching...</div>';
    const results = await SearchMarkdown(currentFolder, q);
    if (!results || results.length === 0) {
        el.searchResults.innerHTML = '<div class="search-hint">No results found</div>';
        return;
    }
    // data-keyword 속성으로 검색어 전달
    el.searchResults.innerHTML = results.map(r => `
        <div class="result-item recent-item" data-path="${r.path}" data-keyword="${escapeAttr(q)}">
            <span class="recent-name">${r.name}</span>
            <span class="recent-path">${r.path}</span>
        </div>
    `).join('');
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Highlight ──────────────────────────────────────────

/**
 * 현재 markdown-container 안에서 keyword를 찾아 <mark> 태그로 감싸고
 * 첫 번째 결과로 스크롤한 뒤 네비게이터를 표시한다.
 */
function applyHighlight(keyword) {
    if (!keyword) return;
    clearHighlight();

    const container = el.markdownContainer;
    const regex = new RegExp(escapeRegex(keyword), 'gi');

    // TreeWalker로 텍스트 노드만 순회
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            // script / style 내부 제외
            const tag = node.parentElement?.tagName?.toLowerCase();
            if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    // 뒤에서부터 교체 (앞에서 하면 nextNode 참조 깨짐)
    for (let i = textNodes.length - 1; i >= 0; i--) {
        const tn = textNodes[i];
        if (!regex.test(tn.nodeValue)) continue;
        regex.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let lastIdx = 0;
        let m;
        while ((m = regex.exec(tn.nodeValue)) !== null) {
            if (m.index > lastIdx) {
                frag.appendChild(document.createTextNode(tn.nodeValue.slice(lastIdx, m.index)));
            }
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = m[0];
            frag.appendChild(mark);
            lastIdx = regex.lastIndex;
        }
        if (lastIdx < tn.nodeValue.length) {
            frag.appendChild(document.createTextNode(tn.nodeValue.slice(lastIdx)));
        }
        tn.parentNode.replaceChild(frag, tn);
    }

    hlMatches = Array.from(container.querySelectorAll('.search-highlight'));
    if (hlMatches.length === 0) {
        showToast(`Cannot find "${keyword}".`);
        return;
    }

    hlCurrent = 0;
    activateHl(hlCurrent);
    updateHlCounter();
    el.highlightNav.classList.remove('hidden');
}

/** 하이라이트 전부 제거 */
function clearHighlight() {
    el.markdownContainer.querySelectorAll('.search-highlight').forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent));
    });
    // 인접 텍스트 노드 정리 (브라우저가 자동으로 하지만 명시적으로)
    el.markdownContainer.normalize();
    hlMatches = [];
    hlCurrent = -1;
    el.highlightNav.classList.add('hidden');
}

/** 특정 인덱스를 active 로 설정하고 스크롤 */
function activateHl(idx) {
    hlMatches.forEach((m, i) => m.classList.toggle('active', i === idx));
    hlMatches[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateHlCounter() {
    el.hlCounter.textContent = `${hlCurrent + 1} / ${hlMatches.length}`;
}

// ── Highlight Navigator buttons ────────────────────────
function bindHighlightNav() {
    el.btnHlNext.addEventListener('click', () => {
        if (hlMatches.length === 0) return;
        const wasLast = hlCurrent === hlMatches.length - 1;
        hlCurrent = (hlCurrent + 1) % hlMatches.length;
        activateHl(hlCurrent);
        updateHlCounter();
        if (wasLast) showToast('Last result. Returning to the start. 🔄');
    });

    el.btnHlPrev.addEventListener('click', () => {
        if (hlMatches.length === 0) return;
        const wasFirst = hlCurrent === 0;
        hlCurrent = (hlCurrent - 1 + hlMatches.length) % hlMatches.length;
        activateHl(hlCurrent);
        updateHlCounter();
        if (wasFirst) showToast('First result. Returning to the end. 🔄');
    });

    el.btnHlClose.addEventListener('click', () => {
        clearHighlight();
    });
}

// ── Toast ──────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 2400) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), duration);
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
            if (result && result.path) loadFile(result.path, result.content, true, true);
        } catch (err) { console.error(err); }
    });
}

// ── Helpers ────────────────────────────────────────────
function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── macOS Menu bar events ──────────────────────────────
function bindMenuEvents() {
    // 파일 > 열기
    EventsOn('menu:open-file', () => handleOpenFile());
    // 보기 > 검색 패널 토글
    EventsOn('menu:toggle-search', () => toggleSearch());
    // 보기 > 테마 전환
    EventsOn('menu:toggle-theme', () => toggleTheme());
    // 보기 > 확대 / 축소 / 실제 크기
    EventsOn('menu:font-up',    () => changeFontSize(2));
    EventsOn('menu:font-down',  () => changeFontSize(-2));
    EventsOn('menu:font-reset', () => {
        currentFontSize = 16;
        el.markdownContainer.style.fontSize = `${currentFontSize}px`;
        persist();
    });
}
