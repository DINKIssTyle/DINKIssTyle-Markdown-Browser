/*
 * Created by DINKIssTyle on 2026.
 * Copyright (C) 2026 DINKI'ssTyle. All rights reserved.
 */

import { marked } from 'marked';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkHtml from 'remark-html';
import mermaid from 'mermaid';

import {
    state, el, getScroller, HOME_SCREEN_PATH, THIRD_PARTY_NOTICES_PATH,
    joinPath, formatDisplayPath, isExternalURL, splitLinkTarget, syncEngineSelector,
} from './main-state.js';
import { getActiveTab } from './main-tabs.js';
import { exitEditMode } from './main-editor.js';
import { applyHighlight, clearHighlight } from './main-ui.js';
import { GetRecentFiles, ReadImageAsDataURL } from '../wailsjs/go/main/App';
import { LogError, LogInfo } from '../wailsjs/runtime/runtime';

// ── Module-level State ─────────────────────────────────────
let recentFilesCache = [];
let htmlFrameResizeObserver = null;

// ── Mermaid Configuration ──────────────────────────────────

function getMermaidConfig() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, Arial, sans-serif',
        themeVariables: {
            // 앱의 포인트 컬러(Accent)를 기본 색상으로 적용
            primaryColor: isDark ? '#0a84ff' : '#0071e3',
            primaryTextColor: isDark ? '#ffffff' : '#ffffff',
            primaryBorderColor: isDark ? '#0a84ff' : '#0071e3',
            lineColor: isDark ? '#8e8e93' : '#636366',
            secondaryColor: isDark ? '#1c1c1e' : '#f5f5f7',
            tertiaryColor: isDark ? '#2c2c2e' : '#e5e5ea',
            fontSize: '14px',
        }
    };
}

// 초기 로드시 설정 적용
mermaid.initialize(getMermaidConfig());

// ── Markdown Rendering ─────────────────────────────────────

export async function renderMarkdown(content) {
    let html;
    if (state.currentEngine === "marked") {
        html = marked.parse(content);
    } else {
        const vf = await unified()
            .use(remarkParse)
            .use(remarkHtml, { sanitize: false })
            .process(content);
        html = String(vf);
    }
    el.markdownContainer.innerHTML = html;
    await postProcess();
}

// ── Recent Files Rendering ─────────────────────────────────

export async function renderRecentFiles() {
    recentFilesCache = await GetRecentFiles();
    if (!recentFilesCache || recentFilesCache.length === 0) {
        el.recentList.classList.add('empty');
        el.recentList.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined empty-state-icon" aria-hidden="true">history</span>
                <div class="empty-state-title">No recent documents yet</div>
                <div class="empty-state-copy">Open a Markdown or HTML file and it will appear here for quick access.</div>
            </div>
        `;
        return;
    }
    el.recentList.classList.remove('empty');
    el.recentList.innerHTML = recentFilesCache.map(f => `
        <div class="recent-item" data-path="${f.path}">
            <span class="recent-name">${f.name}</span>
            <span class="recent-path">${f.path}</span>
        </div>
    `).join('');
}

// ── Active Tab Rendering ───────────────────────────────────

export async function renderActiveTab() {
    const tab = getActiveTab();
    if (!tab) return;

    syncEngineSelector();
    el.currentPath.innerText = formatDisplayPath(state.currentFilePath);

    // Update nav buttons
    el.btnBack.disabled = state.navIndex <= 0;
    el.btnForward.disabled = state.navIndex >= state.navHistory.length - 1;

    // Update edit button state
    const isMarkdown = state.currentDocumentType === 'markdown' && 
                       state.currentFilePath !== HOME_SCREEN_PATH && 
                       state.currentFilePath !== THIRD_PARTY_NOTICES_PATH;
    el.btnEdit.disabled = !isMarkdown;

    if (state.isEditing && !isMarkdown) {
        state.isEditing = false;
        state.editorOriginalContent = "";
    }

    if (state.currentFilePath === HOME_SCREEN_PATH) {
        await renderHomeScreen();
        return;
    }

    el.homeScreen.classList.add('hidden');
    
    if (state.isEditing) {
        el.markdownEditor.value = state.currentMarkdownSource;
        el.editToolbar.classList.remove('hidden');
        el.editorView.classList.remove('hidden');
        el.mainContainer.classList.add('is-editing');
        el.btnEdit.classList.add('active');
        el.contentView.classList.remove('hidden'); 
        el.btnSearchToggle.disabled = true;
        el.selectEngine.disabled = true;
    } else {
        el.editToolbar.classList.add('hidden');
        el.editorView.classList.add('hidden');
        el.mainContainer.classList.remove('is-editing');
        el.btnEdit.classList.remove('active');
        el.btnSearchToggle.disabled = false;
        el.selectEngine.disabled = false;
    }

    getScroller().classList.toggle('html-mode', state.currentDocumentType === 'html');
    if (state.currentDocumentType === 'html') {
        await renderHTMLDocument(state.currentFilePath);
    } else {
        el.htmlFrame.classList.add('hidden');
        el.markdownContainer.classList.remove('hidden');
        await renderMarkdown(state.currentMarkdownSource);
    }

    const saved = state.navHistory[state.navIndex]?.scroll ?? 0;
    getScroller().scrollTop = saved;

    if (state.pendingAnchor) {
        scrollToAnchor(state.pendingAnchor);
        state.pendingAnchor = "";
        tab.pendingAnchor = "";
    }

    if (state.currentDocumentType === 'html') {
        clearHighlight();
        return;
    }

    if (state.pendingKeyword) {
        const keyword = state.pendingKeyword;
        state.pendingKeyword = "";
        tab.pendingKeyword = "";
        applyHighlight(keyword);
    } else {
        clearHighlight();
    }
}

async function renderHomeScreen() {
    if (state.isEditing) await exitEditMode(false);
    await renderRecentFiles();
    cleanupHTMLFrame();
    clearHighlight();
    getScroller().classList.remove('html-mode');
    el.markdownContainer.classList.add('hidden');
    el.htmlFrame.classList.add('hidden');
    el.homeScreen.classList.remove('hidden');
    getScroller().scrollTop = state.navHistory[state.navIndex]?.scroll ?? 0;
}

// ── Post Processing ────────────────────────────────────────

async function postProcess() {
    el.markdownContainer.querySelectorAll('a').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (!href) return;

        const handleLinkNavigation = event => {
            event.preventDefault();
            event.stopPropagation();

            if (href.startsWith('#')) {
                const { anchor: targetAnchor } = splitLinkTarget(href);
                if (targetAnchor) {
                    state.pendingAnchor = targetAnchor;
                    scrollToAnchor(targetAnchor);
                }
                return;
            }

            if (isExternalURL(href)) {
                import('./main-navigation.js').then(mod => mod.confirmAndOpenExternalLink(href));
                return;
            }

            const wantsNewTab = event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
            import('./main-navigation.js').then(mod => mod.resolveLink(href, { newTab: wantsNewTab }));
        };

        anchor.addEventListener('click', handleLinkNavigation);
        anchor.addEventListener('auxclick', event => {
            if (event.button === 1) {
                handleLinkNavigation(event);
            }
        });
    });

    el.markdownContainer.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
            const abs = joinPath(state.currentFolder, src);
            ReadImageAsDataURL(abs)
                .then(dataUrl => {
                    if (dataUrl) img.src = dataUrl;
                })
                .catch(err => console.error(`Failed to load image: ${abs}`, err));
        }
    });

    el.markdownContainer.style.fontSize = `${state.currentFontSize}px`;

    // Mermaid 다이어그램 렌더링 (병렬 실행 방지 위해 await)
    await renderMermaidSub();
}

// ── Mermaid Rendering ──────────────────────────────────────
/**
 * Mermaid 블록을 찾아 렌더링 가능한 div로 변환하고 mermaid 실행
 */
async function renderMermaidSub() {
    // 1. 명시적인 mermaid 클래스가 있는 블록과 모든 코드 블록을 탐색
    const codeBlocks = el.markdownContainer.querySelectorAll('pre code');
    if (codeBlocks.length === 0) return;

    const mermaidKeywords = [
        'graph', 'flowchart', 'sequenceDiagram', 'gantt', 'classDiagram', 
        'stateDiagram', 'erDiagram', 'journey', 'pie', 'gitGraph', 
        'requirementDiagram', 'mindmap', 'timeline'
    ];

    for (let i = 0; i < codeBlocks.length; i++) {
        const codeBlock = codeBlocks[i];
        const pre = codeBlock.parentElement;
        if (!pre || pre.tagName !== 'PRE') continue;

        const content = codeBlock.textContent.trim();
        if (!content) continue;

        // Mermaid 여부 확인: 클래스명에 포함되어 있거나, 첫 번째 단어가 키워드인 경우
        const hasMermaidClass = codeBlock.className.includes('mermaid') || pre.className.includes('mermaid');
        const firstWord = content.split(/[ \n]/)[0];
        const isMermaidKeyword = mermaidKeywords.includes(firstWord);

        if (hasMermaidClass || isMermaidKeyword) {
            // 고유 ID 생성 (Mermaid 렌더링용)
            const id = `mermaid_graph_${Date.now()}_${i}`;
            
            try {
            // 렌더링 직전 테마를 한 번 더 동기화 (다크 모드 전환 대응)
            mermaid.initialize(getMermaidConfig());

            // 개별 블록을 직접 렌더링하여 SVG 획득
            const { svg } = await mermaid.render(id, content);
                const container = document.createElement('div');
                container.className = 'mermaid-rendered';
                container.innerHTML = svg;
                
                // 기존 pre 블록을 결과 SVG로 교체
                pre.replaceWith(container);
            } catch (err) {
                console.error(`Mermaid render failed [${id}]:`, err);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'mermaid-error';
                errorDiv.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">warning</span> Mermaid Syntax Error`;
                errorDiv.title = err.message;
                pre.appendChild(errorDiv);
            }
        }
    }
}

// ── Anchor Scrolling ───────────────────────────────────────

export function scrollToAnchor(anchor) {
    if (!anchor) return;
    const scope = state.currentDocumentType === 'html'
        ? el.htmlFrame.contentDocument
        : el.markdownContainer;
    const target = scope?.querySelector?.(`#${CSS.escape(anchor)}, a[name="${CSS.escape(anchor)}"]`);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        LogInfo(`anchor not found: ${anchor}`);
    }
}

// ── HTML Frame ─────────────────────────────────────────────

export function cleanupHTMLFrame(options = {}) {
    const { resetSource = false } = options;
    if (htmlFrameResizeObserver) {
        htmlFrameResizeObserver.disconnect();
        htmlFrameResizeObserver = null;
    }
    el.htmlFrame.onload = null;
    if (resetSource) {
        el.htmlFrame.src = 'about:blank';
    }
}

function getLocalFileURL(path) {
    const normalized = path.replace(/\\/g, '/');
    const encodedPath = normalized
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
    return `/localfile/${encodedPath}?t=${Date.now()}`;
}

function resizeHTMLFrame() {
    try {
        const doc = el.htmlFrame.contentDocument;
        if (!doc) return;
        const bodyHeight = doc.body ? doc.body.scrollHeight : 0;
        const rootHeight = doc.documentElement ? doc.documentElement.scrollHeight : 0;
        el.htmlFrame.style.height = `${Math.max(bodyHeight, rootHeight, 720)}px`;
    } catch (error) {
        LogError(`html frame resize failed: ${error?.message || error}`);
    }
}

export function applyHTMLZoom() {
    try {
        const doc = el.htmlFrame.contentDocument;
        if (!doc || state.currentDocumentType !== 'html') {
            return;
        }

        const zoom = Math.max(0.625, state.currentFontSize / 16);
        doc.documentElement.style.zoom = String(zoom);
        if (doc.body) {
            doc.body.style.zoom = String(zoom);
        }
        resizeHTMLFrame();
    } catch (error) {
        LogError(`html zoom failed: ${error?.message || error}`);
    }
}

function wireHTMLDocumentLinks(doc) {
    import('./main-navigation.js').then(mod => mod.bindHistoryMouseNavigation(doc));

    doc.querySelectorAll('a[href]').forEach(anchor => {
        const rawHref = anchor.getAttribute('href');
        if (!rawHref) return;

        anchor.addEventListener('click', event => {
            const href = anchor.href || rawHref;

            if (rawHref.startsWith('#')) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (isExternalURL(href)) {
                import('./main-navigation.js').then(mod => mod.confirmAndOpenExternalLink(href));
                return;
            }

            const wantsNewTab = event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
            import('./main-navigation.js').then(mod => mod.resolveLink(href, { newTab: wantsNewTab }));
        });

        anchor.addEventListener('auxclick', event => {
            const href = anchor.href || rawHref;
            if (event.button === 1) {
                event.preventDefault();
                event.stopPropagation();

                if (isExternalURL(href)) {
                    import('./main-navigation.js').then(mod => mod.confirmAndOpenExternalLink(href));
                    return;
                }

                import('./main-navigation.js').then(mod => mod.resolveLink(href, { newTab: true }));
            }
        });
    });
}

async function renderHTMLDocument(path) {
    cleanupHTMLFrame();
    clearHighlight();
    el.markdownContainer.classList.add('hidden');
    el.htmlFrame.classList.remove('hidden');

    await new Promise((resolve, reject) => {
        let settled = false;

        const settle = callback => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(loadTimeout);
            window.clearInterval(readyStatePoll);
            callback();
        };

        const tryResolveFromDocument = () => {
            try {
                const doc = el.htmlFrame.contentDocument;
                if (!doc) {
                    return false;
                }

                const href = el.htmlFrame.contentWindow?.location?.href || "";
                const hasNavigated = href && href !== 'about:blank';
                const hasRenderableRoot = !!(doc.documentElement && (doc.body || doc.documentElement.children.length > 0));
                if (!hasNavigated || !hasRenderableRoot) {
                    return false;
                }

                wireHTMLDocumentLinks(doc);
                applyHTMLZoom();
                resizeHTMLFrame();

                htmlFrameResizeObserver = new ResizeObserver(() => resizeHTMLFrame());
                if (doc.body) htmlFrameResizeObserver.observe(doc.body);
                if (doc.documentElement) htmlFrameResizeObserver.observe(doc.documentElement);
                return true;
            } catch (error) {
                settle(() => reject(error));
                return false;
            }
        };

        const loadTimeout = window.setTimeout(() => {
            if (tryResolveFromDocument()) {
                settle(resolve);
                return;
            }
            const doc = el.htmlFrame.contentDocument;
            if (doc?.documentElement) {
                LogInfo(`html frame timeout fallback path=${path}`);
                settle(resolve);
                return;
            }
            cleanupHTMLFrame({ resetSource: true });
            settle(() => reject(new Error('Timed out while loading the HTML document.')));
        }, 12000);

        const readyStatePoll = window.setInterval(() => {
            if (tryResolveFromDocument()) {
                settle(resolve);
            }
        }, 120);

        el.htmlFrame.onload = () => {
            if (tryResolveFromDocument()) {
                settle(resolve);
            }
        };

        el.htmlFrame.src = getLocalFileURL(path);
    });
}
