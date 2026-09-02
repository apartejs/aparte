/**
 * Every `<button>` core emits says `type="button"` (UI audit LOT 6).
 *
 * A button with no `type` is a SUBMIT button. Core is light DOM and lands wherever the
 * host puts it — and a host that wraps its page in a `<form>` (a settings page, a
 * support form with a chat beside it) then reloads the page the moment a reader copies
 * a code block or presses the branch arrow: the click bubbles to the form as a
 * submission. Thirteen of the buttons core emits had no type, one more was created
 * programmatically without one; the rest already said it. This walks the source so a
 * new site cannot forget it either.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const SRC = resolve(coreRoot(), 'src');

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (name === '__tests__' || name === 'generated') continue;
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) out.push(p);
    }
    return out;
}

/** Comments out: a JSDoc example that shows `createElement('button')` is not a site. */
function stripComments(text: string): string {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

const files = walk(SRC);
const untypedTags: string[] = [];
const untypedCreated: string[] = [];
let tags = 0;
let created = 0;

for (const file of files) {
    const text = stripComments(readFileSync(file, 'utf8'));
    const rel = relative(SRC, file).replace(/\\/g, '/');
    for (const m of text.matchAll(/<button\b([^>]*)>/g)) {
        tags++;
        if (!/\btype=/.test(m[1]!)) untypedTags.push(`${rel}:${lineOf(text, m.index!)}`);
    }
    for (const m of text.matchAll(/createElement\('button'\)/g)) {
        created++;
        const after = text.slice(m.index!, m.index! + 600);
        if (!/\.type\s*=\s*'button'|setAttribute\('type',\s*'button'\)/.test(after)) {
            untypedCreated.push(`${rel}:${lineOf(text, m.index!)}`);
        }
    }
}

describe('every button core emits is type="button"', () => {
    it('read the corpus: the sites are there', () => {
        expect(files.length).toBeGreaterThan(50);
        expect(tags, 'fewer <button> templates than core is known to emit').toBeGreaterThanOrEqual(20);
        expect(created, 'fewer createElement("button") sites than core is known to have').toBeGreaterThanOrEqual(5);
    });

    it('in a template literal, the tag carries type="button"', () => {
        expect(untypedTags, 'a <button> with no type is a submit button inside a host <form>').toEqual([]);
    });

    it('when created programmatically, .type is set right after', () => {
        expect(untypedCreated, 'set .type = "button" (or setAttribute) within the lines that follow createElement').toEqual([]);
    });
});
