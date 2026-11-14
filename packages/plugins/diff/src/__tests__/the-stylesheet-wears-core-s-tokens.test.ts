/**
 * The plugin's stylesheet draws only what is its own, with core's tokens.
 *
 * Every class it styles is `aparte-diff-*`; every value is a token core declares, or one of the
 * plugin's own knobs, read with core's token as its fallback, so a theme that moves the success
 * and error surfaces moves the diff. No colour of its own, logical properties so a right-to-left
 * page holds, and motion only where a reader who asked for less gets none.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DIFF_STYLES } from '../styles.js';

/** A file of the repo, from either working directory (repo root, or the package). */
function read(relative: string): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        try {
            return readFileSync(join(dir, relative), 'utf8');
        } catch { /* keep walking */ }
    }
    throw new Error(`${relative} not found from ${process.cwd()}`);
}

const raw = read('packages/plugins/diff/src/diff.css');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
const declared = new Set([...read('packages/core/src/styles/theme.css').matchAll(/(--aparte-[\w-]+)\s*:/g)].map((m) => m[1]!));
const element = read('packages/plugins/diff/src/aparte-diff.ts');
const knobs = new Set([...element.matchAll(/@cssprop\s+\[(--aparte-diff-[\w-]+)=var\((--aparte-[\w-]+)\)\]/g)].map((m) => `${m[1]}|${m[2]}`));

describe('the stylesheet', () => {
    it('is what the element puts on the page', () => {
        expect(css.length).toBeGreaterThan(1500);
        expect(DIFF_STYLES).toBe(raw);
    });

    it("prefixes every class it styles with the plugin's family", () => {
        const classes = [...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!);
        expect(classes.length).toBeGreaterThan(20);
        expect(classes.filter((c) => !c.startsWith('aparte-diff-'))).toEqual([]);
    });

    it("reads core's tokens, and its own knobs only with core's token behind them, as documented", () => {
        const reads = [...css.matchAll(/var\((--aparte-[\w-]+)(?:,\s*var\((--aparte-[\w-]+)\))?\)/g)];
        expect(reads.length).toBeGreaterThan(30);
        for (const [, name, fallback] of reads) {
            if (name!.startsWith('--aparte-diff-')) expect(knobs.has(`${name}|${fallback}`), `${name} → ${fallback}`).toBe(true);
            else expect(declared.has(name!), name).toBe(true);
        }
        // Each documented knob is read.
        expect(knobs.size).toBe(5);
        for (const knob of knobs) expect(css).toContain(`var(${knob.split('|')[0]}, var(${knob.split('|')[1]}))`);
    });

    it('sets no colour of its own', () => {
        expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|color-mix\(/i);
        for (const m of css.matchAll(/(?:^|[;{\s])(color|background|background-color|border(?:-[a-z-]+)?)\s*:\s*([^;}]+)/g)) {
            const value = m[2]!.trim();
            if (/^(none|inherit|0)$/.test(value)) continue;
            expect(`${m[1]}: ${value}`).toMatch(/var\(--aparte-/);
        }
    });

    it('uses logical properties, so a right-to-left page holds', () => {
        expect(css).not.toMatch(/(?:margin|padding|border)-(?:left|right)\b|(?:^|[;{\s])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)/);
    });

    it('moves only what a reader who asked for less motion sees still', () => {
        expect(css).toMatch(/transition/);
        expect(css).toMatch(/prefers-reduced-motion: reduce/);
    });
});
