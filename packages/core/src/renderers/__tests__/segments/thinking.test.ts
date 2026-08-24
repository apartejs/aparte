/**
 * The reasoning-block renderer: label fallback and collapsed state.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/index.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

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

    it('is CLOSED when `collapsed` is absent — a disclosure the reader opens', () => {
        const renderer = getSegmentRenderer('thinking')!;
        const html = renderer.render({ id: 't0', type: 'thinking', content: 'x' } as any) as string;
        // The old default was the reverse, and nothing pinned it — which is how core's
        // own parser came to emit `collapsed: false` on every block it produced and
        // leave reasoning unfolded for a whole conversation.
        expect(html).not.toContain('<details class="segment segment-thinking" data-segment-id="t0" open');
        expect(html).toContain('<details');
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

    /**
     * The reasoning is prose, so it renders as prose.
     *
     * It used to be escaped plain text in a `white-space: pre-wrap` box, so a model
     * that formats its thinking — and most do — displayed its own Markdown syntax as
     * literal characters. Nothing marked that as deliberate; the `pre-wrap` just made
     * it look chosen.
     */
    describe('renders Markdown like every other prose surface', () => {
        /** A fenced block as the model streams it — the provider is mocked, so only
         *  the fact that it IS a fence matters here. */
        const FENCE = ['```ts', 'const a = 1;', '```'].join('\n');

        afterEach(() => aparteGlobalConfig.reset());

        it('uses the configured Markdown provider on first render', () => {
            aparteGlobalConfig.setMarkdownProvider((raw) => raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
            const renderer = getSegmentRenderer('thinking')!;
            const el = document.createElement('div');
            el.innerHTML = renderer.render({ id: 'm1', type: 'thinking', content: 'a **bold** idea', collapsed: false } as any) as string;

            expect(el.querySelector('.thinking-content strong')?.textContent).toBe('bold');
        });

        it('and on update', () => {
            aparteGlobalConfig.setMarkdownProvider((raw) => raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
            const renderer = getSegmentRenderer('thinking')!;
            const el = document.createElement('div');
            el.innerHTML = renderer.render({ id: 'm2', type: 'thinking', content: 'plain', collapsed: false } as any) as string;

            renderer.update!(el, { id: 'm2', type: 'thinking', content: 'now **bold**', collapsed: false } as any);

            expect(el.querySelector('.thinking-content strong')?.textContent).toBe('bold');
        });

        it('still escapes hostile markup with no provider registered', () => {
            const renderer = getSegmentRenderer('thinking')!;
            const el = document.createElement('div');
            el.innerHTML = renderer.render({ id: 'm3', type: 'thinking', content: '<img src=x onerror=alert(1)>', collapsed: false } as any) as string;

            expect(el.querySelector('.thinking-content img')).toBeNull();
            expect(el.querySelector('.thinking-content')?.textContent).toContain('<img');
        });

        /**
         * A fence inside reasoning is not a `code` SEGMENT — the parser accumulates a
         * thinking block raw until its closing delimiter — so without this it was the
         * one code block in the transcript that never reached the highlighter.
         */
        it('highlights a fenced block once the stream settles', async () => {
            aparteGlobalConfig.setMarkdownProvider(() => '<pre><code class="language-ts">const a = 1;</code></pre>');
            const seen: Array<[string, string]> = [];
            aparteGlobalConfig.setHighlightProvider((code, lang) => {
                seen.push([code, lang]);
                return `<pre class="hl"><code>${code}</code></pre>`;
            });

            const renderer = getSegmentRenderer('thinking')!;
            const el = document.createElement('div');
            el.innerHTML = renderer.render({ id: 'm4', type: 'thinking', content: 'x', collapsed: false } as any) as string;
            document.body.appendChild(el);

            renderer.update!(el, { id: 'm4', type: 'thinking', content: FENCE, isStreaming: false, collapsed: false } as any);

            await vi.waitFor(() => expect(el.querySelector('.thinking-content pre.hl')).toBeTruthy());
            expect(seen[0], 'the language must reach the provider').toEqual(['const a = 1;', 'ts']);
            document.body.innerHTML = '';
        });

        it('does NOT highlight on every streaming delta', () => {
            aparteGlobalConfig.setMarkdownProvider(() => '<pre><code class="language-ts">const a = 1;</code></pre>');
            const calls = vi.fn(() => '<pre class="hl"><code>x</code></pre>');
            aparteGlobalConfig.setHighlightProvider(calls);

            const renderer = getSegmentRenderer('thinking')!;
            const el = document.createElement('div');
            el.innerHTML = renderer.render({ id: 'm5', type: 'thinking', content: 'x', collapsed: false } as any) as string;

            // isStreaming defaults to true — the paint storm the incremental writer
            // exists to avoid must not be traded for a highlight storm.
            renderer.update!(el, { id: 'm5', type: 'thinking', content: FENCE, collapsed: false } as any);

            expect(calls).not.toHaveBeenCalled();
        });
    });

    /**
     * Following the stream, only if the reader is already at the bottom.
     *
     * `.thinking-content` is its own scroll container (`max-height` +
     * `overflow-y: auto`) and `update()` used to replace its text without touching
     * `scrollTop`, so a growing reasoning trace stayed frozen on its first 300px
     * while the new lines piled up below the fold.
     *
     * jsdom has no layout, so the three metrics are defined on the element — and
     * `scrollHeight` is defined as a FUNCTION OF THE TEXT currently in the node.
     * That is what makes the ordering testable: measuring after the write reads a
     * `scrollHeight` that already grew by the new delta, so "am I at the bottom"
     * answers no every time and the block anchors never.
     */
    describe('update() anchors to the bottom while streaming', () => {
        const PX_PER_CHAR = 10;
        const CLIENT_HEIGHT = 100;

        function mountWithFakeLayout(content: string) {
            const renderer = getSegmentRenderer('thinking')!;
            const el = document.createElement('div');
            el.innerHTML = renderer.render({ id: 'a1', type: 'thinking', content, collapsed: false } as any) as string;
            const contentEl = el.querySelector('.thinking-content')! as HTMLElement;

            const height = () => (contentEl.textContent ?? '').length * PX_PER_CHAR;
            const maxScroll = () => Math.max(0, height() - CLIENT_HEIGHT);
            let top = 0;
            Object.defineProperty(contentEl, 'clientHeight', { get: () => CLIENT_HEIGHT });
            Object.defineProperty(contentEl, 'scrollHeight', { get: height });
            Object.defineProperty(contentEl, 'scrollTop', {
                get: () => top,
                // Clamped like a real scroller: `scrollTop = scrollHeight` lands on
                // `scrollHeight - clientHeight`, not beyond it.
                set: (v: number) => { top = Math.min(Math.max(0, v), maxScroll()); },
            });

            const update = (next: string) =>
                renderer.update!(el, { id: 'a1', type: 'thinking', content: next, collapsed: false } as any);
            return { contentEl, update, maxScroll };
        }

        it('follows the new text when the reader was at the bottom', () => {
            const { contentEl, update, maxScroll } = mountWithFakeLayout('x'.repeat(30));
            contentEl.scrollTop = maxScroll(); // reading along, at the bottom

            update('x'.repeat(60));

            expect(contentEl.scrollTop, 'the newest reasoning must be in view').toBe(maxScroll());
        });

        it('leaves the position alone when the reader has scrolled up', () => {
            const { contentEl, update } = mountWithFakeLayout('x'.repeat(30));
            contentEl.scrollTop = 0; // scrolled up to re-read the start

            update('x'.repeat(60));

            expect(contentEl.scrollTop, 'a reader who scrolled up must not be yanked down').toBe(0);
        });

        it('keeps following across several deltas', () => {
            const { contentEl, update, maxScroll } = mountWithFakeLayout('x'.repeat(30));
            contentEl.scrollTop = maxScroll();

            for (const n of [45, 60, 75, 90]) {
                update('x'.repeat(n));
                expect(contentEl.scrollTop).toBe(maxScroll());
            }
        });

        it('does nothing surprising when the content does not overflow', () => {
            const { contentEl, update } = mountWithFakeLayout('x');
            update('xx');
            expect(contentEl.scrollTop).toBe(0);
        });
    });
});
