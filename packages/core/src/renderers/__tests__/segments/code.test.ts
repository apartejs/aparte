/**
 * The fenced-code renderer, including its highlight-provider branches.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect, vi } from 'vitest';
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

describe('default renderer: code — the copy button', () => {
    /**
     * The button copies what is ON SCREEN, not what the segment held when `setup`
     * ran.
     *
     * `setup` runs once, on a streamed fence that is still empty. The bubble
     * replaces its segment object on every `updateSegment` (`{...old, ...updates}`),
     * so a closure over that object freezes at creation. This passed for a long
     * time by accident — deltas arrive through `appendToSegment`, which mutates in
     * place — and one extra update at the end of a turn was enough to make the
     * button copy an empty string. Measured in a browser before this test existed:
     * closure 0 characters, DOM 36.
     */
    it('copies the source after the content arrived, not the empty segment setup saw', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        const original = globalThis.navigator?.clipboard;
        Object.defineProperty(globalThis.navigator, 'clipboard', {
            value: { writeText }, configurable: true,
        });

        const renderer = getSegmentRenderer('code')!;
        // 1. The segment as it exists when the fence opens: no content yet.
        const opening = { id: 'c1', type: 'code', language: 'ts', content: '' } as never;
        const host = document.createElement('div');
        host.innerHTML = renderer.render(opening) as string;
        const el = host.firstElementChild as HTMLElement;
        document.body.appendChild(host);
        renderer.setup?.(el, opening);
        // `setup` kicks off an async highlight of that empty content; let it land
        // first, exactly as it does in a browser, so the update below is what the
        // DOM ends up holding.
        await Promise.resolve();

        // 2. The content arrives, and the bubble hands over a NEW object.
        const settled = { id: 'c1', type: 'code', language: 'ts', content: 'const answer = 42;', isStreaming: true } as never;
        renderer.update?.(el, settled);

        (el.querySelector('.code-copy') as HTMLElement).click();

        expect(writeText).toHaveBeenCalledWith('const answer = 42;');

        if (original) {
            Object.defineProperty(globalThis.navigator, 'clipboard', { value: original, configurable: true });
        }
        host.remove();
    });
});
