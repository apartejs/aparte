// @vitest-environment jsdom
/**
 * The reasoning block's chevron turns when the block opens (UI audit LOT 4).
 *
 * The thinking renderer wears the accordion recipe, whose rotation rule is
 * `details[open] > .aparte-accordion__header .aparte-accordion__icon { rotate(180deg) }`.
 * The renderer put the glyph straight into the `<summary>` without that class, so the
 * rule matched nothing: the chevron pointed down over an open panel, in every consumer,
 * since the renderer was moved onto the recipe. The recipe also sized the icon with
 * `width`/`height` instead of feeding `--aparte-icon-size`, the token every glyph reads —
 * a component wears the recipe, and the recipe feeds the icon's own knob.
 *
 * `--aparte-thinking-toggle-size` went with the old hand-drawn chevron and nothing has
 * read it since; a knob with no reader is a lie on the generated reference page.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../aparte-chat-bubble.js';
import type { AparteSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

const STYLES = resolve(process.cwd(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const accordion = strip(readFileSync(resolve(STYLES, 'surface/accordion.css'), 'utf8'));
const theme = strip(readFileSync(resolve(STYLES, 'theme.css'), 'utf8'));

afterEach(() => { document.body.innerHTML = ''; });

describe('the reasoning block', () => {
    it('wraps its chevron in the accordion icon class, so the recipe can turn it', () => {
        const bubble = document.createElement('aparte-chat-bubble') as BubbleEl;
        bubble.setAttribute('data-role', 'assistant');
        bubble.setAttribute('message-id', 'a1');
        document.body.appendChild(bubble);
        bubble.setSegments([{ id: 't', type: 'thinking', content: 'weighing', label: 'Thinking' }]);

        const summary = bubble.querySelector('details.aparte-segment-thinking > summary.aparte-accordion__header');
        expect(summary).toBeTruthy();
        const icon = summary!.querySelector('.aparte-accordion__icon');
        expect(icon, 'the glyph must sit inside .aparte-accordion__icon or the rotation rule matches nothing').toBeTruthy();
        expect(icon!.querySelector('svg')).toBeTruthy();
    });
});

describe('the accordion icon recipe', () => {
    const block = accordion.match(/\.aparte-accordion__icon\s*\{([^}]*)\}/)?.[1] ?? '';

    it('feeds the icon its size through --aparte-icon-size, not width/height', () => {
        expect(block).toMatch(/--aparte-icon-size\s*:/);
        expect(block).not.toMatch(/(^|[^-])width\s*:/);
        expect(block).not.toMatch(/(^|[^-])height\s*:/);
    });

    it('still turns the icon for both ways of being open', () => {
        expect(accordion).toMatch(/details\[open\]\s*>\s*\.aparte-accordion__header\s+\.aparte-accordion__icon/);
        expect(accordion).toMatch(/\.aparte-accordion__header\[aria-expanded='true'\]\s+\.aparte-accordion__icon/);
    });

    it('the dead knob of the old hand-drawn chevron is gone', () => {
        expect(theme).not.toMatch(/--aparte-thinking-toggle-size\s*:/);
    });
});
