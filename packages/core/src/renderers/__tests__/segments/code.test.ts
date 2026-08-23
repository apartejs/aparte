/**
 * The fenced-code renderer, including its highlight-provider branches.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

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
