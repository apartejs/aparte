/**
 * The plugin's stylesheet draws only what is its own, with core's tokens.
 *
 * Its rows are core's and wear core's sheets; what is left — the task line, the spacing of
 * the rows, the standalone view's block — names its classes `aparte-subagent-*`, reads
 * core's spacing, border, muted ink and type tokens, sets no colour of its own, and uses
 * logical properties so a right-to-left locale puts the rule on its own leading edge.
 * `scripts/check-derived-vars.mjs` reads plugin sheets too; this suite holds the rules that
 * are this plugin's.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { subagentRenderer } from '../segment.js';

/** The sheet, from either working directory (repo root, or the package). */
function sheet(): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        for (const root of ['packages/plugins/subagents', '.']) {
            try {
                return readFileSync(join(dir, root, 'src', 'subagents.css'), 'utf8');
            } catch { /* keep walking */ }
        }
    }
    throw new Error(`subagents.css not found from ${process.cwd()}`);
}

const raw = sheet();
const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Core's tokens this sheet may read, and the one knob of its own. */
const ALLOWED = [
    /^--aparte-space-\d+$/, /^--aparte-font-size-[a-z]+$/, /^--aparte-border$/, /^--aparte-border-width$/,
    /^--aparte-text-muted$/, /^--aparte-content-(font-size|line-height|color)$/, /^--aparte-font-family$/,
    /^--aparte-subagent-indent$/,
];

describe('the stylesheet', () => {
    it('reads the whole sheet', () => {
        expect(css.length).toBeGreaterThan(500);
    });

    it('is what the segment renderer hands core', () => {
        expect(subagentRenderer.getStyles?.()).toBe(raw);
    });

    it("prefixes every class it styles with the plugin's family", () => {
        const classes = [...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!);
        expect(classes.length).toBeGreaterThan(2);
        expect(classes.filter((c) => !c.startsWith('aparte-subagent-'))).toEqual([]);
    });

    it("reads only core's tokens, and its own indent", () => {
        const names = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!);
        expect(names.length).toBeGreaterThan(5);
        expect(names.filter((n) => !ALLOWED.some((re) => re.test(n)))).toEqual([]);
    });

    it('sets no colour of its own', () => {
        expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|color-mix\(/i);
        for (const m of css.matchAll(/(?:^|[;{\s])(color|background|background-color|border(?:-[a-z-]+)?)\s*:\s*([^;}]+)/g)) {
            expect(`${m[1]}: ${m[2]!.trim()}`).toMatch(/var\(--aparte-/);
        }
    });

    it('uses logical properties, so a right-to-left locale holds', () => {
        expect(css).not.toMatch(/(?:margin|padding|border)-(?:left|right)\b|(?:^|[;{\s])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)/);
        expect(css).toMatch(/border-inline-start/);
        expect(css).toMatch(/padding-inline-start:\s*var\(--aparte-subagent-indent/);
    });

    it('moves nothing, or respects a reader who asked for less motion', () => {
        if (/animation|transition/.test(css)) expect(css).toMatch(/prefers-reduced-motion/);
    });
});
