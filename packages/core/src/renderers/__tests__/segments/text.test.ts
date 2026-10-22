/**
 * The plain-text renderer.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '../../../config/index.js';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

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

    /*
     * A fence in a text segment built by hand (`setSegments`, a restored message) is not a
     * `code` segment — only the streaming parser makes one — and the bubble's own pass skips a
     * message with segments, so it reached no highlighter at all.
     */
    describe('a fence in a settled text segment', () => {
        afterEach(() => aparteGlobalConfig.reset());

        it('is highlighted once the segment is set up', async () => {
            aparteGlobalConfig.setMarkdownProvider(() => '<pre><code class="language-ts">const a = 1;</code></pre>');
            const seen: Array<[string, string]> = [];
            aparteGlobalConfig.setHighlightProvider((code, lang) => { seen.push([code, lang]); return `<pre class="hl"><code>${code}</code></pre>`; });
            const renderer = getSegmentRenderer('text')!;
            // As `setSegments` passes it: no streaming flag at all, which means finished.
            const segment = { id: 't1', type: 'text', content: '```ts\nconst a = 1;\n```' } as any;
            const el = document.createElement('div');
            el.innerHTML = renderer.render(segment) as string;
            document.body.appendChild(el);
            renderer.setup!(el.firstElementChild as HTMLElement, segment);
            await vi.waitFor(() => expect(el.querySelector('pre.hl')).toBeTruthy());
            expect(seen[0]).toEqual(['const a = 1;', 'ts']);
            document.body.innerHTML = '';
        });

        it('is not highlighted while the segment streams', () => {
            aparteGlobalConfig.setMarkdownProvider(() => '<pre><code class="language-ts">x</code></pre>');
            const calls = vi.fn(() => '<pre class="hl"><code>x</code></pre>');
            aparteGlobalConfig.setHighlightProvider(calls);
            const renderer = getSegmentRenderer('text')!;
            const el = document.createElement('div');
            el.innerHTML = renderer.render({ id: 't2', type: 'text', content: 'x' } as any) as string;
            renderer.update!(el.firstElementChild as HTMLElement, { id: 't2', type: 'text', content: '```ts\nx\n```', isStreaming: true } as any);
            expect(calls).not.toHaveBeenCalled();
        });
    });
});
