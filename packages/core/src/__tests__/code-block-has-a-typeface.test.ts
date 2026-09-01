/**
 * A code block is set in the code typeface, at a code size (UI audit, visual half — LOT 18).
 *
 * The code segment's `<pre>` had `margin`, `padding`, `white-space`, `overflow-wrap` and
 * nothing else: no `font-family`, no `font-size`, no `line-height`. It fell into the
 * browser's generic `monospace` (Courier New on Windows) and inherited the PROSE's size and
 * leading — 16.2px on 1.7 — so the monospace was the largest, airiest text in the whole
 * message. Only inline code read `--aparte-code-font-family`. The same rule has to survive
 * the highlighter's replacement (`<pre class="shiki">` lands in the same wrapper).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(process.cwd(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const prose = strip(readFileSync(resolve(STYLES, 'prose.css'), 'utf8'));
const theme = strip(readFileSync(resolve(STYLES, 'theme.css'), 'utf8'));

/** The declarations of the rule whose selector list contains `sel`. */
function ruleFor(css: string, sel: string): string {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(sel)) return m[2]!;
    }
    return '';
}

describe('the code block', () => {
    const block = ruleFor(prose, '.aparte-code-content-wrapper pre');

    it('is set in the code typeface', () => {
        expect(block).toMatch(/font-family:\s*var\(--aparte-code-font-family\)/);
    });

    it('has a size and a leading of its own, from theme tokens', () => {
        expect(block).toMatch(/font-size:\s*var\(--aparte-code-block-font-size\)/);
        expect(block).toMatch(/line-height:\s*var\(--aparte-code-block-line-height\)/);
        expect(theme).toMatch(/^\s*--aparte-code-block-font-size\s*:/m);
        expect(theme).toMatch(/^\s*--aparte-code-block-line-height\s*:/m);
    });

    it('keeps them when the highlighter replaces the <pre>', () => {
        // The rule targets the wrapper's `pre`, whatever class the highlighter puts on it.
        expect(block).not.toBe('');
        expect(prose).not.toMatch(/\.aparte-code-content-wrapper\s+pre\.shiki/);
    });
});
