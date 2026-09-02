/**
 * Every `@cssprop [--x=default]` in core's JSDoc says what the stylesheets actually give
 * `--x` (UI audit LOT 12).
 *
 * The default in the JSDoc is a hand copy of a value that lives in a stylesheet, and the
 * two drifted: 61 of 172 documented defaults were stale when this was measured — radii
 * off by 50 to 100 %, paddings in pixels where the sheet reads the spacing scale, an
 * attachment tile documented at 40px and at 56px on two pages when the theme says 72px.
 * The generated component pages print that default in their tables, so a reader tuning
 * a knob started from a value the sheet never had.
 *
 * The source of truth, in order: a declaration on `:root` in theme.css; else a scoped
 * declaration in any sheet (a knob the component sets on itself); else the fallback of
 * the `var(--x, F)` that reads it (a knob nothing declares, whose default IS the
 * fallback). The documented default has to be that value, character for character.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const SRC = resolve(coreRoot(), 'src');
const STYLES = join(SRC, 'styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

function walk(dir: string, ext: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (name === '__tests__' || name === 'generated') continue;
        if (statSync(p).isDirectory()) walk(p, ext, out);
        else if (name.endsWith(ext) && !name.endsWith('.d.ts') && !name.endsWith('.test.ts')) out.push(p);
    }
    return out;
}

/** `var(--x, F)` with F allowed to nest parentheses (`color-mix(…)`, `var(--y, z)`). */
function fallbacks(css: string, into: Map<string, string>): void {
    const re = /var\((--aparte-[\w-]+)\s*,\s*/g;
    for (let m = re.exec(css); m; m = re.exec(css)) {
        let depth = 1;
        let i = m.index + m[0].length;
        const start = i;
        for (; i < css.length && depth > 0; i++) {
            if (css[i] === '(') depth++;
            else if (css[i] === ')') depth--;
        }
        if (depth === 0 && !into.has(m[1]!)) into.set(m[1]!, norm(css.slice(start, i - 1)));
    }
}

const rootDecl = new Map<string, string>();
const scopedDecl = new Map<string, string>();
const fallback = new Map<string, string>();
for (const file of walk(STYLES, '.css')) {
    const css = strip(readFileSync(file, 'utf8'));
    for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = norm(block[1]!);
        const isRoot = /^:root\b/.test(selector) && !/prefers-color-scheme|\[data-aparte-theme=/.test(selector);
        for (const d of block[2]!.matchAll(/(--aparte-[\w-]+)\s*:\s*([^;]+);/g)) {
            const target = isRoot ? rootDecl : scopedDecl;
            if (!target.has(d[1]!)) target.set(d[1]!, norm(d[2]!));
        }
    }
    fallbacks(css, fallback);
}

const documented: Array<{ at: string; name: string; doc: string }> = [];
for (const file of walk(SRC, '.ts')) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(SRC, file).replace(/\\/g, '/');
    for (const m of text.matchAll(/@cssprop\s+\[(--aparte-[\w-]+)=([^\]]*)\]/g)) {
        documented.push({ at: `${rel}:${text.slice(0, m.index).split('\n').length}`, name: m[1]!, doc: norm(m[2]!) });
    }
}

const truthOf = (name: string) => rootDecl.get(name) ?? scopedDecl.get(name) ?? fallback.get(name);

describe('@cssprop defaults match the stylesheets', () => {
    it('read the corpus', () => {
        expect(rootDecl.size).toBeGreaterThan(300);
        expect(documented.length).toBeGreaterThan(120);
    });

    it('every documented default has a source: a :root declaration, a scoped one, or the fallback that reads it', () => {
        const orphans = documented.filter((d) => truthOf(d.name) === undefined).map((d) => `${d.at} ${d.name}`);
        expect(orphans, 'a default with no stylesheet behind it documents a knob nothing gives a value').toEqual([]);
    });

    it('every documented default is that source, character for character', () => {
        const stale = documented
            .filter((d) => truthOf(d.name) !== undefined && truthOf(d.name) !== d.doc)
            .map((d) => `${d.at} ${d.name}: doc "${d.doc}" vs sheet "${truthOf(d.name)}"`);
        expect(stale, 'copy the stylesheet value into the JSDoc — the generated pages print it').toEqual([]);
    });
});
