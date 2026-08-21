/**
 * Mermaid 다이어그램 판별, 전처리, DOM 정리 헬퍼 함수
 */

export const MERMAID_KEYWORDS = [
    'graph',
    'flowchart',
    'sequenceDiagram',
    'gantt',
    'classDiagram',
    'stateDiagram',
    'stateDiagram-v2',
    'erDiagram',
    'journey',
    'pie',
    'gitGraph',
    'requirementDiagram',
    'mindmap',
    'timeline',
    'quadrantChart',
    'c4Context',
    'sankey-beta',
    'packet-beta',
    'block-beta',
    'xychart-beta',
    'architecture-beta',
    'kanban',
];

/**
 * 주석(%%)이나 메타데이터(---)를 건너뛰고 첫 번째 유효한 구문 단어를 추출
 */
export function getEffectiveMermaidFirstWord(content) {
    if (!content || typeof content !== 'string') return '';
    
    const lines = content.split('\n');
    let inFrontmatter = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Frontmatter 영역 처리 (--- ... ---)
        if (line === '---') {
            inFrontmatter = !inFrontmatter;
            continue;
        }
        if (inFrontmatter) continue;

        // Mermaid 주석(%%) 건너뛰기
        if (line.startsWith('%%')) continue;

        // 첫 번째 유효한 토큰 추출
        const firstToken = line.split(/[ \t\r\n({[]/)[0];
        return firstToken;
    }

    return '';
}

/**
 * 코드 블록이 Mermaid 다이어그램인지 여부 판별
 */
export function isMermaidBlock(content, codeClassName = '', preClassName = '') {
    if (!content || typeof content !== 'string') return false;
    const trimmed = content.trim();
    if (!trimmed) return false;

    const classString = `${codeClassName || ''} ${preClassName || ''}`;
    const hasMermaidClass = /\b(mermaid|language-mermaid)\b/i.test(classString);
    if (hasMermaidClass) return true;

    const firstWord = getEffectiveMermaidFirstWord(trimmed);
    return MERMAID_KEYWORDS.includes(firstWord);
}

/**
 * 마크다운 파서에서 변환되었을 수 있는 HTML 엔티티를 복원
 */
export function cleanMermaidSource(content) {
    if (!content || typeof content !== 'string') return '';
    return content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

/**
 * Mermaid 렌더링 실패 또는 진행 중 document.body에 생성된 고아 DOM 엘리먼트 정리
 */
export function cleanupMermaidDomArtifacts(id, rootDoc = (typeof document !== 'undefined' ? document : null)) {
    if (!rootDoc || !id) return;
    try {
        const directId = rootDoc.getElementById(id);
        if (directId && directId.parentElement === rootDoc.body) {
            directId.remove();
        }
        const dId = rootDoc.getElementById(`d${id}`);
        if (dId && dId.parentElement === rootDoc.body) {
            dId.remove();
        }
        const orphans = rootDoc.querySelectorAll(`body > [id^="${id}"], body > [id^="d${id}"]`);
        orphans.forEach((el) => el.remove());
    } catch {
        // DOM 정리 중 에러는 무시
    }
}
