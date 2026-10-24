/**
 * The shimmer: a light sweeping across a label while something runs.
 *
 * The motion conversational products put on a step in progress ("Searching the web",
 * "Thinking") where an agent's tool shows a spinner and a word. One recipe for every
 * place that needs it — the reasoning line, a quiet tool row, a conversation's title —
 * so it is drawn once and stops the same way everywhere: still under reduced motion,
 * plain text in forced colours and where `background-clip: text` is not supported.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Every block whose selector list is exactly `.aparte-shimmer`, wherever it is nested. */
const blocks = (): string[] => [...css.matchAll(/\.aparte-shimmer\s*\{([^}]*)\}/g)].map((m) => m[1]!);
/** The body of an at-rule (one level of nesting), by its prelude. */
const atRules = (prelude: RegExp): string[] => {
    const out: string[] = [];
    for (const m of css.matchAll(new RegExp(`@(?:media|supports)\\s*${prelude.source}\\s*\\{`, 'g'))) {
        let depth = 1;
        let i = m.index! + m[0].length;
        const start = i;
        while (depth > 0 && i < css.length) {
            if (css[i] === '{') depth++;
            else if (css[i] === '}') depth--;
            i++;
        }
        out.push(css.slice(start, i - 1));
    }
    return out;
};

describe('the shimmer recipe', () => {
    it('reads as text where the sweep cannot run: a real colour, the base one', () => {
        expect(blocks().some((b) => /color:\s*var\(--aparte-shimmer-base\)/.test(b))).toBe(true);
    });

    it('sweeps only where background-clip: text is supported, through the text fill, not the colour', () => {
        const supported = atRules(/\([^{]*background-clip:\s*text[^{]*\)/).join(' ');
        expect(supported).toMatch(/\.aparte-shimmer/);
        expect(supported).toMatch(/background-clip:\s*text/);
        expect(supported).toMatch(/-webkit-text-fill-color:\s*transparent/);
        expect(supported).toMatch(/animation:\s*aparte-shimmer\s+var\(--aparte-duration-shimmer\)\s+linear\s+infinite/);
        expect(supported).toMatch(/var\(--aparte-shimmer-shine\)/);
    });

    it('has something behind every letter at every point of the sweep', () => {
        // The text fill is transparent, so a glyph shows only the background behind it. A
        // 200%-wide gradient that does not repeat leaves half the box bare at both ends of
        // the travel: half the label vanished at the start and end of every loop.
        const supported = atRules(/\([^{]*background-clip:\s*text[^{]*\)/).join(' ');
        expect(supported).not.toMatch(/background-repeat:\s*no-repeat/);
    });

    it('sweeps from the start edge in a right-to-left text too', () => {
        expect(css).toMatch(/\.aparte-shimmer:dir\(rtl\)\s*\{[^}]*animation-direction:\s*reverse/);
    });

    it('holds still under reduced motion, as plain text', () => {
        const still = atRules(/\(prefers-reduced-motion:\s*reduce\)/).filter((b) => b.includes('.aparte-shimmer')).join(' ');
        expect(still).toMatch(/animation:\s*none/);
        expect(still).toMatch(/background-image:\s*none/);
        expect(still).toMatch(/-webkit-text-fill-color:\s*currentColor/);
    });

    it('is plain text in forced colours', () => {
        const forced = atRules(/\(forced-colors:\s*active\)/).filter((b) => b.includes('.aparte-shimmer')).join(' ');
        expect(forced).toMatch(/-webkit-text-fill-color:\s*currentColor/);
        expect(forced).toMatch(/background-image:\s*none/);
    });

    it('has its keyframe, its loop length and its two colours', () => {
        expect(css).toMatch(/@keyframes\s+aparte-shimmer\s*\{/);
        expect(css).toMatch(/--aparte-duration-shimmer:\s*2s/);
        // Text against text: muted to full ink, which keeps its order in both themes.
        expect(css).toMatch(/--aparte-shimmer-base:\s*var\(--aparte-text-muted\)/);
        expect(css).toMatch(/--aparte-shimmer-shine:\s*var\(--aparte-text\)/);
    });
});
