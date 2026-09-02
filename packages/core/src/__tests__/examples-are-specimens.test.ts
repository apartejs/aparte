/**
 * A stylesheet's header example is a specimen, not an excerpt (UI audit — LOT 13).
 *
 * 34 of the 59 kit previews render, verbatim, the example a sheet's header comment or a
 * component's `@example` carries. That is not documentation, it is the showcase — the
 * first thing a visitor sees of the kit — and it was written as an excerpt: the accordion
 * showed ONE item, so `:last-child` removed the only rule the family draws and the page
 * showed nothing; the alert's `--danger` instance had no `__icon` while the `--info`
 * above it did, and the left column zig-zagged by 23px; the skeleton's example forced a
 * `block-size: 64px` inline against the family's own `5rem` token; the chat's example
 * hard-coded `height: 320px`, which shears the first turn at 375.
 *
 * Three rules, each checked here against every sheet and every element example:
 *   1. enough instances for the relation rules to exist — a sheet that styles a part by
 *      `:first-child` / `:last-child` / `+` / `~` shows at least two of that part;
 *   2. every documented part present — a family with an `__icon` part carries it on every
 *      root instance of the example;
 *   3. no hard value that contradicts a token of the family — no inline `px` size in a
 *      sheet's example, no `px` height on an element's `@example` root (a chat is `rem`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const STYLES = join(coreRoot(), 'src/styles');
const COMPONENTS = join(coreRoot(), 'src/components');
const walk = (dir: string, ext: string, out: string[] = []): string[] => {
    for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p, ext, out);
        else if (p.endsWith(ext) && !p.includes('__tests__')) out.push(p);
    }
    return out;
};

/** The example the docs generator lifts: indented comment lines that carry a tag, and the indented lines that follow. */
function headerExample(css: string): string {
    const lines: string[] = [];
    for (const [, body] of css.matchAll(/\/\*([\s\S]*?)\*\//g)) {
        for (const raw of body!.split('\n')) {
            const line = raw.replace(/^\s*\*\s?/, '');
            if (/^\s{2,}<[a-z!]/i.test(line) || (lines.length && /^\s{2,}\S/.test(line))) lines.push(line.trim());
        }
    }
    return lines.join('\n');
}

const sheets = walk(STYLES, '.css').map((file) => {
    const css = readFileSync(file, 'utf8');
    return { file: relative(STYLES, file).replace(/\\/g, '/'), example: headerExample(css), rules: css.replace(/\/\*[\s\S]*?\*\//g, ' ') };
}).filter((s) => s.example);

describe('a stylesheet example', () => {
    it('shows at least two of any part the sheet styles by its position among siblings', () => {
        const offenders: string[] = [];
        for (const { file, example, rules } of sheets) {
            const parts = new Set<string>();
            for (const m of rules.matchAll(/\.(aparte-[a-z-]+(?:__[a-z-]+)?)(?::first-child|:last-child|:not\(:last-child\)|:not\(:first-child\))/g)) parts.add(m[1]!);
            for (const m of rules.matchAll(/\.(aparte-[a-z-]+(?:__[a-z-]+)?)\s*[+~]\s*\.\1\b/g)) parts.add(m[1]!);
            for (const part of parts) {
                const shown = (example.match(new RegExp(`class="[^"]*\\b${part}\\b`, 'g')) ?? []).length;
                if (shown === 1) offenders.push(`${file}: one ${part}, and the sheet styles it by its position`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('carries the family’s icon part on every root instance', () => {
        const offenders: string[] = [];
        for (const { file, example, rules } of sheets) {
            for (const icon of new Set([...rules.matchAll(/\.(aparte-[a-z-]+)__icon\b/g)].map((m) => m[1]!))) {
                const roots = (example.match(new RegExp(`class="${icon}(?:\\s|")`, 'g')) ?? []).length;
                const icons = (example.match(new RegExp(`${icon}__icon\\b`, 'g')) ?? []).length;
                if (roots && icons && icons < roots) offenders.push(`${file}: ${roots} ${icon} but ${icons} ${icon}__icon`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('forces no pixel size inline against the family’s tokens', () => {
        const offenders: string[] = [];
        for (const { file, example } of sheets) {
            for (const m of example.matchAll(/style="([^"]*)"/g)) {
                if (/(?:block-size|inline-size|height|width)\s*:\s*\d+px/.test(m[1]!)) offenders.push(`${file}: style="${m[1]}"`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('an element’s @example', () => {
    it('sizes a chat in rem, never in px', () => {
        const offenders: string[] = [];
        for (const file of walk(COMPONENTS, '.ts')) {
            const src = readFileSync(file, 'utf8');
            for (const m of src.matchAll(/^\s*\*\s*<aparte-[a-z-]+[^>]*style="[^"]*(?:height|block-size)\s*:\s*\d+px[^"]*"/gm)) {
                offenders.push(`${relative(COMPONENTS, file).replace(/\\/g, '/')}: ${m[0].trim()}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
