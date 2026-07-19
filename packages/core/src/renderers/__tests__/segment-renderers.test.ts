import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    registerSegmentRenderer,
    unregisterSegmentRenderer,
    getSegmentRenderer,
    collectRendererStyles,
    registerDefaultRenderers
} from '../segment-renderers.js';
import { AparteConfig } from '../../config/aparte-config.js';

// Register default renderers once so the tool_call renderer is available.
registerDefaultRenderers();

describe('Segment Renderers', () => {

    // ─── registry CRUD ────────────────────────────────────────────────────

    describe('registerSegmentRenderer / getSegmentRenderer', () => {
        afterEach(() => {
            unregisterSegmentRenderer('test_type');
        });

        it('registers a renderer and retrieves it by type', () => {
            const renderer = { type: 'test_type', render: () => '<div/>' };
            registerSegmentRenderer(renderer);
            expect(getSegmentRenderer('test_type')).toBe(renderer);
        });

        it('returns undefined for an unregistered type', () => {
            expect(getSegmentRenderer('__unknown__')).toBeUndefined();
        });

        it('overwrites an existing renderer when re-registered', () => {
            const r1 = { type: 'test_type', render: () => 'R1' };
            const r2 = { type: 'test_type', render: () => 'R2' };
            registerSegmentRenderer(r1);
            registerSegmentRenderer(r2);
            expect(getSegmentRenderer('test_type')).toBe(r2);
        });
    });

    describe('unregisterSegmentRenderer', () => {
        it('removes a registered renderer', () => {
            registerSegmentRenderer({ type: 'test_type', render: () => '' });
            unregisterSegmentRenderer('test_type');
            expect(getSegmentRenderer('test_type')).toBeUndefined();
        });

        it('is a no-op for an unregistered type', () => {
            expect(() => unregisterSegmentRenderer('never_registered')).not.toThrow();
        });
    });

    // ─── collectRendererStyles ────────────────────────────────────────────

    describe('collectRendererStyles()', () => {
        beforeEach(() => {
            registerSegmentRenderer({
                type: 'styled_test',
                render: () => '',
                getStyles: () => '.styled-test { color: hotpink; }'
            });
        });
        afterEach(() => {
            unregisterSegmentRenderer('styled_test');
        });

        it('includes styles from renderers that implement getStyles()', () => {
            const styles = collectRendererStyles();
            expect(styles).toContain('.styled-test { color: hotpink; }');
        });
    });

    // ─── default renderers ────────────────────────────────────────────────

    describe('default renderer: text', () => {
        it('is registered', () => {
            expect(getSegmentRenderer('text')).toBeDefined();
        });

        it('renders segment content', () => {
            const renderer = getSegmentRenderer('text')!;
            const seg = { id: 's1', type: 'text', content: 'Hello World' };
            const html = renderer.render(seg as any);
            expect(html).toContain('Hello World');
        });
    });

    describe('default renderer: code', () => {
        it('is registered', () => {
            expect(getSegmentRenderer('code')).toBeDefined();
        });

        it('renders a code block with language', () => {
            const renderer = getSegmentRenderer('code')!;
            const seg = { id: 's2', type: 'code', content: 'const x = 1;', language: 'typescript' };
            const html = renderer.render(seg as any);
            expect(html).toContain('const x = 1;');
        });

        it('escapes a prompt-injected language tag (XSS) in both text and attribute positions', () => {
            const renderer = getSegmentRenderer('code')!;
            // `language` is the ```lang fence tag — LLM-authored, hostile-by-default.
            const seg = {
                id: 'xss',
                type: 'code',
                content: 'x',
                language: '</span><img src=x onerror=alert(1)>"><script>alert(2)</script>',
            };
            const html = renderer.render(seg as any);
            expect(html).not.toContain('<img src=x onerror=');
            expect(html).not.toContain('<script>alert(2)');
            // The class="language-…" attribute must not be broken out of.
            expect(html).not.toContain('"><script>');
            expect(html).toContain('&lt;img src=x onerror=');
        });
    });

    describe('default renderer: thinking', () => {
        it('is registered', () => {
            expect(getSegmentRenderer('thinking')).toBeDefined();
        });

        it('renders thinking content', () => {
            const renderer = getSegmentRenderer('thinking')!;
            const seg = { id: 's3', type: 'thinking', content: 'Let me think...', collapsed: false };
            const html = renderer.render(seg as any);
            expect(html).toContain('Let me think...');
        });

        it('escapes a hostile label (XSS) — a host may render a non-hardcoded label', () => {
            const renderer = getSegmentRenderer('thinking')!;
            const seg = { id: 's4', type: 'thinking', label: '<img src=x onerror=alert(1)>', content: 'x', collapsed: false };
            const html = renderer.render(seg as any);
            expect(html).not.toContain('<img src=x onerror=');
            expect(html).toContain('&lt;img src=x onerror=');
        });
    });

    describe('default renderer: error', () => {
        afterEach(() => AparteConfig.reset());

        it('is registered', () => {
            expect(getSegmentRenderer('error')).toBeDefined();
        });

        it('renders error message', () => {
            const renderer = getSegmentRenderer('error')!;
            const seg = { id: 's4', type: 'error', content: 'Something went wrong', code: 'FAIL' };
            const html = renderer.render(seg as any);
            expect(html).toContain('Something went wrong');
        });

        it('defers to AparteConfig.setErrorRenderer (string output)', () => {
            AparteConfig.setErrorRenderer(({ message }) => `<div class="custom-err">${message}!!</div>`);
            const out = getSegmentRenderer('error')!.render({ id: 'e1', type: 'error', content: 'boom', details: 'X' } as any);
            expect(out).toContain('custom-err');
            expect(out).toContain('boom!!');
        });

        it('defers to AparteConfig.setErrorRenderer (HTMLElement, tagged with data-segment-id)', () => {
            AparteConfig.setErrorRenderer(() => {
                const el = document.createElement('div');
                el.className = 'el-err';
                return el;
            });
            const out = getSegmentRenderer('error')!.render({ id: 'e2', type: 'error', content: 'boom' } as any);
            expect(out).toBeInstanceOf(HTMLElement);
            expect((out as HTMLElement).getAttribute('data-segment-id')).toBe('e2');
        });
    });

    // ─── consumer-registered custom tool renderer (the VISUAL declaration) ───
    // A consumer declares a tool's behaviour with registerTool() and its LOOK with
    // registerToolRenderer(name, {render, setup, getStyles}). These prove the custom
    // renderer is actually resolved + invoked when that tool renders — not just stored.

    describe('custom tool renderer (consumer registerToolRenderer)', () => {
        afterEach(() => {
            AparteConfig.unregisterToolRenderer('visual_tool');
        });

        it('renders the consumer HTML in place of the default pill', () => {
            AparteConfig.registerToolRenderer('visual_tool', {
                render: () => `<div class="my-visual">searching the web…</div>`,
            });
            const seg = {
                id: 'vt1', type: 'tool_call',
                toolCall: { id: 'c1', name: 'visual_tool', input: {} },
                status: 'pending',
            };
            const html = getSegmentRenderer('tool_call')!.render(seg as any);
            expect(html).toContain('class="my-visual"');
            expect(html).not.toContain('tool-pill-name'); // the default pill is bypassed
        });

        it('falls back to the default pill when the custom render returns empty', () => {
            AparteConfig.registerToolRenderer('visual_tool', { render: () => '' });
            const seg = {
                id: 'vt2', type: 'tool_call',
                toolCall: { id: 'c2', name: 'visual_tool', input: {} },
                status: 'pending',
            };
            const html = getSegmentRenderer('tool_call')!.render(seg as any);
            expect(html).toContain('tool-pill'); // empty custom output => hide-to-default
        });

        it('invokes the consumer setup() hook with the mounted element + segment', () => {
            let seenEl: HTMLElement | null = null;
            let seenSeg: unknown = null;
            AparteConfig.registerToolRenderer('visual_tool', {
                render: () => `<div class="my-visual"></div>`,
                setup: (el, seg) => { seenEl = el; seenSeg = seg; },
            });
            const seg = {
                id: 'vt3', type: 'tool_call',
                toolCall: { id: 'c3', name: 'visual_tool', input: {} },
                status: 'resolved',
            };
            const host = document.createElement('div');
            getSegmentRenderer('tool_call')!.setup!(host, seg as any);
            expect(seenEl).toBe(host);
            expect(seenSeg).toBe(seg);
        });

        it('keeps the built-in Approve/Reject gate over the custom renderer while awaiting approval', () => {
            AparteConfig.registerToolRenderer('visual_tool', {
                render: () => `<div class="my-visual">SHOULD NOT SHOW YET</div>`,
            });
            const seg = {
                id: 'vt4', type: 'tool_call',
                toolCall: { id: 'c4', name: 'visual_tool', input: {} },
                status: 'awaiting-approval',
            };
            const html = getSegmentRenderer('tool_call')!.render(seg as any);
            expect(html).toContain('data-tool-decision="approve"');
            expect(html).not.toContain('SHOULD NOT SHOW YET'); // custom only takes over AFTER approval
        });
    });

    // ─── default renderer: tool_call (Phase 1) ───────────────────────────

    describe('default renderer: tool_call', () => {
        it('is registered after registerDefaultRenderers()', () => {
            expect(getSegmentRenderer('tool_call')).toBeDefined();
        });

        it('renders a pill with the tool name', () => {
            const renderer = getSegmentRenderer('tool_call')!;
            const seg = {
                id: 'tc1',
                type: 'tool_call',
                toolCall: { id: 'c1', name: 'web_search', input: {} },
                status: 'pending'
            };
            const html = renderer.render(seg as any);
            expect(html).toContain('web_search');
        });

        it('escapes a hostile tool-call id in data-segment-id (XSS)', () => {
            const renderer = getSegmentRenderer('tool_call')!;
            // segment.id is `tool-${toolCallId}`; toolCallId comes verbatim from the
            // endpoint's SSE `delta.tool_calls[].id` — hostile-by-default.
            const seg = {
                id: 'tool-"><img src=x onerror=alert(1)>',
                type: 'tool_call',
                toolCall: { id: '"><img src=x onerror=alert(1)>', name: 'web_search', input: {} },
                status: 'resolved',
            };
            const html = renderer.render(seg as any);
            expect(html).not.toContain('<img src=x onerror=');
            expect(html).not.toContain('"><img');
            expect(html).toContain('&lt;img src=x onerror=');
        });

        it('renders spinner for pending status', () => {
            const renderer = getSegmentRenderer('tool_call')!;
            const seg = {
                id: 'tc2', type: 'tool_call',
                toolCall: { id: 'c2', name: 'my_tool', input: {} },
                status: 'pending'
            };
            const html = renderer.render(seg as any);
            expect(html).toContain('tool-pill-spinner');
            expect(html).not.toContain(AparteConfig.getIcon('check'));
        });

        it('renders checkmark for resolved status', () => {
            const renderer = getSegmentRenderer('tool_call')!;
            const seg = {
                id: 'tc3', type: 'tool_call',
                toolCall: { id: 'c3', name: 'my_tool', input: {} },
                status: 'resolved'
            };
            const html = renderer.render(seg as any);
            expect(html).toContain(AparteConfig.getIcon('check'));
            expect(html).not.toContain('tool-pill-spinner');
        });

        it('renders cross for aborted status', () => {
            const renderer = getSegmentRenderer('tool_call')!;
            const seg = {
                id: 'tc4', type: 'tool_call',
                toolCall: { id: 'c4', name: 'my_tool', input: {} },
                status: 'aborted'
            };
            const html = renderer.render(seg as any);
            expect(html).toContain(AparteConfig.getIcon('close'));
        });

        it('sets data-status attribute matching the segment status', () => {
            const renderer = getSegmentRenderer('tool_call')!;
            const seg = {
                id: 'tc5', type: 'tool_call',
                toolCall: { id: 'c5', name: 'calc', input: {} },
                status: 'resolved'
            };
            const html = renderer.render(seg as any);
            expect(html).toContain('data-status="resolved"');
        });

        it('escapes HTML in tool name to prevent XSS', () => {
            const renderer = getSegmentRenderer('tool_call')!;
            const seg = {
                id: 'tc6', type: 'tool_call',
                toolCall: { id: 'c6', name: '<script>alert(1)</script>', input: {} },
                status: 'pending'
            };
            const html = renderer.render(seg as any);
            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('provides CSS via getStyles()', () => {
            const renderer = getSegmentRenderer('tool_call')!;
            const styles = renderer.getStyles?.();
            expect(styles).toBeDefined();
            expect(styles).toContain('tool-pill');
            expect(styles).toContain('tool-pill-spinner');
        });
    });

    describe('default renderer: progress (ARIA)', () => {
        it('exposes a progressbar role with aria-value* and a label', () => {
            const renderer = getSegmentRenderer('progress')!;
            const html = renderer.render({ id: 'p1', type: 'progress', label: 'Uploading', percent: 42 } as never);
            expect(html).toContain('role="progressbar"');
            expect(html).toContain('aria-valuemin="0"');
            expect(html).toContain('aria-valuemax="100"');
            expect(html).toContain('aria-valuenow="42"');
            expect(html).toContain('aria-label="Uploading"');
        });
    });

    // ─── default renderer: thinking (label fallback + collapsed state) ────

    describe('default renderer: thinking (extra)', () => {
        it('falls back to the locale "thinking" string when no label is given', () => {
            const renderer = getSegmentRenderer('thinking')!;
            const html = renderer.render({ id: 't1', type: 'thinking', content: 'x' } as any);
            expect(html).toContain('<span class="thinking-label">Thinking...</span>');
        });

        it('uses a custom label verbatim (escaped) when provided', () => {
            const renderer = getSegmentRenderer('thinking')!;
            const html = renderer.render({ id: 't2', type: 'thinking', content: 'x', label: 'Reasoning' } as any);
            expect(html).toContain('<span class="thinking-label">Reasoning</span>');
        });

        it('renders <details open> when not collapsed', () => {
            const renderer = getSegmentRenderer('thinking')!;
            const html = renderer.render({ id: 't3', type: 'thinking', content: 'x', collapsed: false } as any);
            expect(html).toMatch(/<details[^>]*\bopen\b[^>]*>/);
        });

        it('renders <details> WITHOUT open when collapsed', () => {
            const renderer = getSegmentRenderer('thinking')!;
            const html = renderer.render({ id: 't4', type: 'thinking', content: 'x', collapsed: true } as any);
            expect(html).not.toMatch(/<details[^>]*\bopen\b[^>]*>/);
        });

        it('update() writes the new content as text (no HTML injection)', () => {
            const renderer = getSegmentRenderer('thinking')!;
            const el = document.createElement('div');
            el.innerHTML = renderer.render({ id: 't5', type: 'thinking', content: 'old', collapsed: false } as any) as string;
            renderer.update!(el, { id: 't5', type: 'thinking', content: '<b>new</b>', collapsed: false } as any);
            const contentEl = el.querySelector('.thinking-content')!;
            expect(contentEl.textContent).toBe('<b>new</b>');
            expect(contentEl.innerHTML).not.toContain('<b>');
        });
    });

    // ─── default renderer: error (built-in fallback markup, no custom renderer) ─

    describe('default renderer: error (built-in fallback)', () => {
        afterEach(() => AparteConfig.reset());

        it('renders an icon, the "Error" title and the escaped message', () => {
            const renderer = getSegmentRenderer('error')!;
            const html = renderer.render({ id: 'e10', type: 'error', content: '<script>alert(1)</script>' } as any) as string;
            expect(html).toContain('class="error-icon-wrapper"');
            expect(html).toContain('<div class="error-title">Error</div>');
            expect(html).toContain('<div class="error-message">&lt;script&gt;alert(1)&lt;/script&gt;</div>');
            expect(html).not.toContain('<script>alert(1)</script>');
        });

        it('omits the details block entirely when details is not provided', () => {
            const renderer = getSegmentRenderer('error')!;
            const html = renderer.render({ id: 'e11', type: 'error', content: 'boom' } as any) as string;
            expect(html).not.toContain('error-details');
        });

        it('renders an escaped details block when provided', () => {
            const renderer = getSegmentRenderer('error')!;
            const html = renderer.render({ id: 'e12', type: 'error', content: 'boom', details: '<img src=x onerror=alert(1)>' } as any) as string;
            expect(html).toContain('class="error-details"');
            expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
            expect(html).not.toContain('<img src=x onerror=');
        });

        it('carries the segment id (escaped) on data-segment-id', () => {
            const renderer = getSegmentRenderer('error')!;
            const html = renderer.render({ id: '"><img src=x>', type: 'error', content: 'boom' } as any) as string;
            expect(html).not.toContain('"><img src=x>');
        });
    });

    // ─── default renderer: code (extra branches) ───────────────────────────

    describe('default renderer: code (extra)', () => {
        it('renders the filename span when a filename is given', () => {
            const renderer = getSegmentRenderer('code')!;
            const html = renderer.render({ id: 'c10', type: 'code', content: 'x', filename: 'index.ts' } as any);
            expect(html).toContain('<span class="code-filename">index.ts</span>');
            expect(html).not.toContain('code-header-filler');
        });

        it('renders a header filler (no filename span) when filename is absent', () => {
            const renderer = getSegmentRenderer('code')!;
            const html = renderer.render({ id: 'c11', type: 'code', content: 'x' } as any);
            expect(html).not.toContain('code-filename');
            expect(html).toContain('<span class="code-header-filler"></span>');
        });

        it('defaults the code language class to "text" when no language is given', () => {
            const renderer = getSegmentRenderer('code')!;
            const html = renderer.render({ id: 'c12', type: 'code', content: 'x' } as any);
            expect(html).toContain('<code class="language-text">');
        });

        it('escapes hostile code content', () => {
            const renderer = getSegmentRenderer('code')!;
            const html = renderer.render({ id: 'c13', type: 'code', content: '<script>alert(1)</script>' } as any);
            expect(html).not.toContain('<script>alert(1)</script>');
            expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        });

        it('escapes a hostile filename', () => {
            const renderer = getSegmentRenderer('code')!;
            const html = renderer.render({ id: 'c14', type: 'code', content: 'x', filename: '<img src=x onerror=alert(1)>' } as any);
            expect(html).not.toContain('<img src=x onerror=');
            expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        });
    });

    // ─── default renderer: terminal ─────────────────────────────────────────

    describe('default renderer: terminal', () => {
        it('is registered', () => {
            expect(getSegmentRenderer('terminal')).toBeDefined();
        });

        it('renders the escaped command and the terminal icon', () => {
            const renderer = getSegmentRenderer('terminal')!;
            const html = renderer.render({ id: 'term1', type: 'terminal', command: 'echo <hi>' } as any);
            expect(html).toContain('class="terminal-command"');
            expect(html).toContain('&lt;hi&gt;');
            expect(html).not.toContain('echo <hi>');
        });

        it('shows a running indicator (no run button) while isRunning is true', () => {
            const renderer = getSegmentRenderer('terminal')!;
            const html = renderer.render({ id: 'term2', type: 'terminal', command: 'ls', isRunning: true } as any);
            expect(html).toContain('terminal-running');
            expect(html).not.toContain('terminal-run-btn');
        });

        it('shows a run button (no running indicator) when isRunning is false/absent', () => {
            const renderer = getSegmentRenderer('terminal')!;
            const html = renderer.render({ id: 'term3', type: 'terminal', command: 'ls' } as any);
            expect(html).toContain('terminal-run-btn');
            expect(html).not.toContain('terminal-running');
        });

        it('renders the escaped output block only when output is present', () => {
            const renderer = getSegmentRenderer('terminal')!;
            const withOutput = renderer.render({ id: 'term4', type: 'terminal', command: 'ls', output: '<b>listing</b>' } as any);
            expect(withOutput).toContain('class="terminal-output"');
            expect(withOutput).toContain('&lt;b&gt;listing&lt;/b&gt;');

            const withoutOutput = renderer.render({ id: 'term5', type: 'terminal', command: 'ls' } as any);
            expect(withoutOutput).not.toContain('terminal-output');
        });

        it('shows a failure message for a non-zero exit code', () => {
            const renderer = getSegmentRenderer('terminal')!;
            const html = renderer.render({ id: 'term6', type: 'terminal', command: 'false', exitCode: 1 } as any);
            expect(html).toContain('class="terminal-error"');
            expect(html).toContain('Command failed with exit code 1');
        });

        it('does not show a failure message for exit code 0', () => {
            const renderer = getSegmentRenderer('terminal')!;
            const html = renderer.render({ id: 'term7', type: 'terminal', command: 'true', exitCode: 0 } as any);
            expect(html).not.toContain('terminal-error');
        });

        it('does not show a failure message when exitCode is undefined', () => {
            const renderer = getSegmentRenderer('terminal')!;
            const html = renderer.render({ id: 'term8', type: 'terminal', command: 'sleep 1' } as any);
            expect(html).not.toContain('terminal-error');
        });
    });

    // ─── default renderer: file-tree ────────────────────────────────────────

    describe('default renderer: file-tree', () => {
        it('is registered', () => {
            expect(getSegmentRenderer('file-tree')).toBeDefined();
        });

        it('renders a flat list of files with the file icon and escaped names', () => {
            const renderer = getSegmentRenderer('file-tree')!;
            const html = renderer.render({
                id: 'ft1', type: 'file-tree',
                files: [{ name: '<b>a.ts</b>', path: 'a.ts', type: 'file' }],
            } as any);
            expect(html).toContain('📄');
            expect(html).toContain('&lt;b&gt;a.ts&lt;/b&gt;');
            expect(html).not.toContain('<b>a.ts</b>');
        });

        it('renders nested children with increasing indentation and the folder icon', () => {
            const renderer = getSegmentRenderer('file-tree')!;
            const html = renderer.render({
                id: 'ft2', type: 'file-tree',
                files: [{
                    name: 'src', path: 'src', type: 'directory',
                    children: [{ name: 'index.ts', path: 'src/index.ts', type: 'file' }],
                }],
            } as any);
            expect(html).toContain('📁');
            expect(html).toContain('padding-left: 0px');
            expect(html).toContain('padding-left: 16px');
            expect(html).toContain('index.ts');
        });

        it('applies a file-status-* class matching the node status', () => {
            const renderer = getSegmentRenderer('file-tree')!;
            const html = renderer.render({
                id: 'ft3', type: 'file-tree',
                files: [{ name: 'new.ts', path: 'new.ts', type: 'file', status: 'added' }],
            } as any);
            expect(html).toContain('file-status-added');
        });

        it('renders the optional escaped title when provided, omits it otherwise', () => {
            const renderer = getSegmentRenderer('file-tree')!;
            const withTitle = renderer.render({ id: 'ft4', type: 'file-tree', files: [], title: '<i>Changes</i>' } as any);
            expect(withTitle).toContain('class="file-tree-title"');
            expect(withTitle).toContain('&lt;i&gt;Changes&lt;/i&gt;');

            const withoutTitle = renderer.render({ id: 'ft5', type: 'file-tree', files: [] } as any);
            expect(withoutTitle).not.toContain('file-tree-title');
        });
    });

    // ─── default renderer: pipeline-waiting ─────────────────────────────────

    describe('default renderer: pipeline-waiting', () => {
        it('is registered', () => {
            expect(getSegmentRenderer('pipeline-waiting')).toBeDefined();
        });

        it('renders three pulsing dots with a status role and aria-label', () => {
            const renderer = getSegmentRenderer('pipeline-waiting')!;
            const html = renderer.render({ id: 'pw1', type: 'pipeline-waiting' } as any);
            expect(html).toContain('role="status"');
            expect(html).toContain('aria-label="Generating…"');
            expect((html.match(/pw-dot/g) || []).length).toBe(3);
        });

        it('auto-removes itself once a sibling segment is appended after it', async () => {
            const renderer = getSegmentRenderer('pipeline-waiting')!;
            const parent = document.createElement('div');
            const el = document.createElement('div');
            el.innerHTML = renderer.render({ id: 'pw2', type: 'pipeline-waiting' } as any) as string;
            const waitingEl = el.firstElementChild as HTMLElement;
            parent.appendChild(waitingEl);
            renderer.setup!(waitingEl, { id: 'pw2', type: 'pipeline-waiting' } as any);

            const sibling = document.createElement('div');
            parent.appendChild(sibling);

            // MutationObserver callbacks run as a microtask.
            await Promise.resolve();
            await new Promise(r => setTimeout(r, 0));
            expect(parent.contains(waitingEl)).toBe(false);
        });
    });

    // ─── default renderer: artifact ─────────────────────────────────────────

    describe('default renderer: artifact', () => {
        afterEach(() => AparteConfig.reset());

        it('is registered', () => {
            expect(getSegmentRenderer('artifact')).toBeDefined();
        });

        it('renders the code pane with escaped content and a title derived from kind when none given', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'a1', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
                content: '<script>alert(1)</script>', isStreaming: false,
            } as any);
            expect(html).toContain('aparte-art-card__title">HTML document<');
            expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
            expect(html).not.toContain('<script>alert(1)</script>');
        });

        it('uses a provided (escaped) title verbatim instead of the kind label', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'a2', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
                content: 'x', title: '<b>My Doc</b>', isStreaming: false,
            } as any);
            expect(html).toContain('&lt;b&gt;My Doc&lt;/b&gt;');
        });

        it('forces the code tab while streaming even for a previewable kind', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'a3', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
                content: '<div>hi</div>', isStreaming: true,
            } as any);
            expect(html).toContain('data-tab="code"');
            expect(html).toContain('data-streaming="true"');
            // No preview built while still streaming.
            expect(html).toContain('Generating preview…');
        });

        it('switches to the preview tab and builds a srcdoc once streaming finishes for a previewable kind', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'a4', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
                content: '<p>done</p>', isStreaming: false,
            } as any);
            expect(html).toContain('data-tab="preview"');
            expect(html).toContain('data-previewable="true"');
            expect(html).toContain('<iframe class="aparte-art-card__frame"');
            expect(html).toContain('sandbox="allow-scripts"');
        });

        it('stays on the code tab for a non-previewable kind (e.g. python) even when settled', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'a5', type: 'artifact', mimeType: 'text/x-python', artifactType: 'python',
                content: 'print(1)', isStreaming: false,
            } as any);
            expect(html).toContain('data-tab="code"');
            expect(html).toContain('data-previewable="false"');
            expect(html).not.toContain('data-pane="preview"');
        });

        it('uses the app-registered preview builder when one is set (instead of the offline fallback)', () => {
            AparteConfig.setArtifactPreviewBuilder((kind, body, title) => `<!--CUSTOM ${kind} ${title}-->${body}`);
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'a6', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
                content: '<p>x</p>', title: 'Doc', isStreaming: false,
            } as any) as string;
            expect(html).toContain('CUSTOM html Doc');
        });

        it('strips a wrapping markdown code fence from the content before rendering', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'a7', type: 'artifact', mimeType: 'text/css', artifactType: 'css',
                content: '```css\nbody { color: red; }\n```', isStreaming: false,
            } as any);
            expect(html).toContain('body { color: red; }');
            expect(html).not.toContain('```');
        });

        // ─ binary file kinds (pdf/xlsx/docx) — separate UX track ─

        it('renders a streaming binary-file card (disabled download, "Generating…")', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'b1', type: 'artifact', mimeType: 'application/pdf', artifactType: 'pdf',
                content: 'sandbox code', isStreaming: true,
            } as any);
            expect(html).toContain('segment-artifact-file');
            expect(html).toContain('data-state="streaming"');
            expect(html).toContain('Generating…');
            expect(html).toContain('data-action="download" disabled');
        });

        it('renders a settled (not-yet-cached) binary-file card as "compiling"', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'b2', type: 'artifact', mimeType: 'application/pdf', artifactType: 'pdf',
                content: 'sandbox code', isStreaming: false,
            } as any);
            expect(html).toContain('data-state="compiling"');
            expect(html).toContain('Rebuilding preview…');
        });

        it('escapes a hostile title in a binary-file card', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const html = renderer.render({
                id: 'b3', type: 'artifact', mimeType: 'application/pdf', artifactType: 'pdf',
                content: 'x', title: '<img src=x onerror=alert(1)>', isStreaming: true,
            } as any);
            expect(html).not.toContain('<img src=x onerror=');
            expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        });

        it('setup() wires the tab-switch buttons to flip data-tab and aria-selected', () => {
            const renderer = getSegmentRenderer('artifact')!;
            const seg = {
                id: 'a8', type: 'artifact', mimeType: 'text/html', artifactType: 'html',
                content: '<p>hi</p>', isStreaming: false,
            };
            const host = document.createElement('div');
            host.innerHTML = renderer.render(seg as any) as string;
            const el = host.firstElementChild as HTMLElement;
            renderer.setup!(el, seg as any);

            const codeTabBtn = el.querySelector<HTMLButtonElement>('[data-tab-target="code"]')!;
            codeTabBtn.click();
            expect(el.getAttribute('data-tab')).toBe('code');
            expect(codeTabBtn.getAttribute('aria-selected')).toBe('true');
        });
    });
});
