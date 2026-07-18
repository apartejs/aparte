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
});
