// @vitest-environment jsdom
/**
 * The transcript and the composer share one left edge (UI audit — LOT 21).
 *
 * What the composer indented and what the transcript indented were two independent
 * stacks: the transcript's rows sit inside a padding plus the scrollbar gutter the
 * scroller reserves on both edges, the composer inside a flat padding — so the two
 * boxes disagreed by 10px at 768, by the gutter's half at 1280, and the reading-column
 * demo showed three left edges 12px apart. A container query tightens the transcript
 * below 520px and cannot reach the composer, which is a container itself.
 *
 * The composer cannot know the gutter, but the viewport can measure where its rows
 * start: it publishes `--aparte-transcript-inset` on the chat host — the distance from
 * the host's inline edge to the row's box — and the composer pads by that, so the two
 * boxes align at every width, whatever the gutter and whatever the step.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../aparte-chat.js';
import '../../viewport/aparte-chat-viewport.js';
import '../../composer/aparte-composer.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('the transcript inset', () => {
    it('is published by the viewport on the chat host', async () => {
        const chat = document.createElement('aparte-chat');
        document.body.appendChild(chat);
        await new Promise((r) => setTimeout(r, 0));
        const inset = chat.style.getPropertyValue('--aparte-transcript-inset');
        expect(inset, 'the viewport writes the inset it measures on its host').toMatch(/^\d+(\.\d+)?px$/);
    });

    it('is what the composer pads by', () => {
        const composer = readFileSync(resolve(process.cwd(), 'src/styles/components/composer.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
        const rule = composer.match(/(?:^|\n)aparte-composer\s*\{([^}]*)\}/g)?.map((m) => m).join('\n') ?? '';
        expect(rule).toMatch(/padding-inline:\s*var\(--aparte-transcript-inset,\s*var\(--aparte-viewport-padding\)\)/);
    });
});
