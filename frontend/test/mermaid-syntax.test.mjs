import test from 'node:test';
import assert from 'node:assert/strict';

// Node.js 환경에서 Mermaid 11.x DOMPurify hook 지원 설정
import dompurifyModule from 'dompurify';
const DOMPurify = dompurifyModule.default || dompurifyModule;
if (typeof DOMPurify === 'function' && !DOMPurify.addHook) {
    DOMPurify.addHook = () => {};
    DOMPurify.sanitize = (s) => s;
}
if (!globalThis.DOMPurify) {
    globalThis.DOMPurify = DOMPurify;
}

import mermaid from 'mermaid';
import {
    MERMAID_KEYWORDS,
    getEffectiveMermaidFirstWord,
    isMermaidBlock,
    cleanMermaidSource,
    cleanupMermaidDomArtifacts,
} from '../src/mermaid-helper.mjs';

// Mermaid Node.js 환경 초기화
mermaid.initialize({
    startOnLoad: false,
    suppressErrorRendering: true,
});

test('identifies all standard Mermaid keywords correctly', () => {
    for (const keyword of MERMAID_KEYWORDS) {
        assert.equal(isMermaidBlock(`${keyword}\n    A --> B`), true, `Should detect keyword: ${keyword}`);
    }
});

test('identifies Mermaid block with leading comments or frontmatter', () => {
    const withComment = `%% This is a comment\nflowchart TD\n    A --> B`;
    assert.equal(isMermaidBlock(withComment), true);

    const withFrontmatter = `---\ntitle: Diagram Title\n---\nsequenceDiagram\n    Alice->>Bob: Hello`;
    assert.equal(isMermaidBlock(withFrontmatter), true);
});

test('identifies Mermaid block with explicit classes', () => {
    assert.equal(isMermaidBlock('custom diagram code', 'language-mermaid', ''), true);
    assert.equal(isMermaidBlock('custom diagram code', '', 'mermaid'), true);
});

test('does not misidentify non-mermaid code or empty text', () => {
    assert.equal(isMermaidBlock(''), false);
    assert.equal(isMermaidBlock('   \n  '), false);
    assert.equal(isMermaidBlock('const x = 10;'), false);
    assert.equal(isMermaidBlock('import os\nprint("hello")'), false);
});

test('restores HTML entities into valid characters', () => {
    const raw = 'graph TD\n    A[&quot;Start &amp; &lt;Init&gt;&quot;] --&gt; B';
    const cleaned = cleanMermaidSource(raw);
    assert.equal(cleaned, 'graph TD\n    A["Start & <Init>"] --> B');
});

test('successfully parses valid Mermaid diagrams via mermaid.parse()', async () => {
    const testCases = [
        `flowchart TD
    A["사용자 입력"] --> B["프롬프트 조립"]
    B --> C["시스템 프롬프트"]
    C --> D["모델 내부 판단"]`,

        `sequenceDiagram
    participant U as User
    participant App as main-ai.js
    participant Model as AI Model
    participant Editor as CodeMirror

    U->>App: Send Prompt
    App->>App: Collect selection/context
    App->>Model: Send system + user prompt
    Note over Model: Determine intent internally
    Model-->>App: <intent>...<support_report>...<replacement>...

    App->>App: extractStructuredAIPayload()

    alt intent = edit
        App->>Editor: Replace selected_text with replacement
        App->>U: Display support_report if necessary
    else intent = question
        App->>U: Display only support_report
    else intent = ambiguous
        App->>U: Display only support_report
    else fallback
        App->>App: Existing parsing/fallback handling
    end`,

        `classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal : +int age
    Animal : +String gender
    Animal: +isMammal()`,

        `stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still`,

        `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains`,

        `pie title Pets adopted by volunteers
    "Dogs" : 386
    "Cats" : 85
    "Rats" : 15`,

        `gitGraph
    commit
    branch hotfix
    checkout hotfix
    commit
    checkout main
    merge hotfix`,

        `mindmap
  root((mindmap))
    Origins
      Long history
    Research
      On effectiveness`,

        `timeline
    title History of Social Media Platform
    2002 : LinkedIn
    2004 : Facebook
    2006 : Twitter`
    ];

    for (const code of testCases) {
        const isValid = await mermaid.parse(code, { suppressErrors: true });
        assert.ok(isValid !== false, `Diagram should parse successfully:\n${code}`);
    }
});

test('catches broken diagram syntax caused by unclosed backticks and trailing prose', async () => {
    // 사용자가 경험한 실제 오류 패턴 (닫는 백틱 누락으로 인한 일반 대화문 혼입)
    const brokenDiagram = `sequenceDiagram
    participant U as User
    participant App as main-ai.js
    participant Model as AI Model
    participant Editor as CodeMirror

    U->>App: Send Prompt
    App->>App: Collect selection/context
    App->>Model: Send system + user prompt
    Note over Model: Determine intent internally
    Model-->>App: <intent>...<support_report>...<replacement>...

    App->>App: extractStructuredAIPayload()

    alt intent = edit
        App->>Editor: Replace selected_text with replacement
        App->>U: Display support_report if necessary
    else intent = question
        App->>U: Display only support_report
    else intent = ambiguous
        App->>U: Display only support_report
    else fallback
        App->>App: Existing parsing/fallback handling
    end

원하시면 다음엔 이걸 기준으로 “선택 텍스트 있음/없음”까지 포함한 확장 다이어그램도 그려드릴게요.`;

    let failed = false;
    try {
        const result = await mermaid.parse(brokenDiagram, { suppressErrors: false });
        if (result === false) failed = true;
    } catch {
        failed = true;
    }

    assert.equal(failed, true, 'Broken sequenceDiagram with trailing Korean text must fail parsing gracefully');
});

test('cleanupMermaidDomArtifacts removes injected elements from body', () => {
    const mockElements = new Map();
    const mockBodyChildren = new Set();

    const mockDoc = {
        body: {},
        getElementById(id) {
            return mockElements.get(id) || null;
        },
        querySelectorAll(selector) {
            const results = [];
            for (const [id, el] of mockElements.entries()) {
                if (id.startsWith('test_id') || id.startsWith('dtest_id')) {
                    if (el.parentElement === mockDoc.body) {
                        results.push(el);
                    }
                }
            }
            return results;
        }
    };

    const el1 = {
        parentElement: mockDoc.body,
        remove() {
            mockElements.delete('test_id');
            mockBodyChildren.delete(this);
        }
    };
    const el2 = {
        parentElement: mockDoc.body,
        remove() {
            mockElements.delete('dtest_id');
            mockBodyChildren.delete(this);
        }
    };

    mockElements.set('test_id', el1);
    mockElements.set('dtest_id', el2);
    mockBodyChildren.add(el1);
    mockBodyChildren.add(el2);

    cleanupMermaidDomArtifacts('test_id', mockDoc);

    assert.equal(mockElements.size, 0);
    assert.equal(mockBodyChildren.size, 0);
});
