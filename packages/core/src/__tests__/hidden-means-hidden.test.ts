/**
 * `hidden` hides a recipe element (UI audit, follow-up of LOT 15).
 *
 * Measured on the built preview: the copy button of a tool-only turn carried `hidden`
 * (out of the accessibility tree, as intended) and was still painted, because
 * `.aparte-btn { display: inline-flex }` — an author declaration — outranks the
 * browser's `[hidden] { display: none }`. Seventy-one base recipes set `display`; six
 * had a `[hidden]` rule of their own. One rule in base.css, scoped to our classes by
 * prefix, restores the browser's meaning for all of them.
 *
 * That rule then met two cases it did not know (apartejs/aparte#207). It looked for our
 * class first in the list (`^=`) or after a SPACE (`*=" aparte-"`), but HTML separates
 * class names with any ASCII whitespace: space, tab, line feed, form feed, carriage return.
 * A multi-line `className` template in JSX writes a newline, and `class="my-footer\n
 * aparte-card__footer" hidden` stayed painted. And it forced `display: none` on
 * `hidden="until-found"` too, which the browser hides with `content-visibility: hidden`
 * precisely so that find-in-page can reveal it.
 *
 * This suite reads the rule's SELECTORS for what they mean, not how they are spelled: the
 * CSS string escapes are decoded first, so `"\9aparte-"` — which a parser reads as U+009A
 * followed by "parte-", because `a` is a hex digit — fails here as it fails in a browser.
 * The rendered half is `e2e/tests/hidden-attribute.spec.ts`: a source-shape test alone
 * was green the whole time the tab and the newline did not work.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const base = readFileSync(resolve(coreRoot(), 'src/styles/base.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** The five characters HTML allows between two class names: ASCII whitespace. */
const SEPARATORS: Array<[name: string, separator: string]> = [
    ['space', ' '],
    ['tab', '\t'],
    ['line feed', '\n'],
    ['form feed', '\f'],
    ['carriage return', '\r'],
];

/** The rule that forces `display: none !important` on a `[hidden]` element: its selector list and its body. */
function hiddenRule(): { prelude: string; body: string } {
    for (const m of base.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (/\[hidden\]/.test(m[1]!) && /display\s*:\s*none\s*!important/.test(m[2]!)) {
            return { prelude: m[1]!.trim(), body: m[2]! };
        }
    }
    throw new Error('base.css has no `[hidden] { display: none !important }` rule');
}

/** A CSS string's value: hex escapes (up to six digits, one trailing whitespace swallowed) and `\x` escapes. */
function decode(cssString: string): string {
    return cssString.replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|\\([\s\S])/g, (_all, hex?: string, char?: string) =>
        hex ? String.fromCodePoint(parseInt(hex, 16)) : char!,
    );
}

/** What the rule tests on the class attribute: what it must START with (`^=`) and what it must CONTAIN (`*=`). */
function classTests(prelude: string): { prefixes: string[]; needles: string[] } {
    const prefixes: string[] = [];
    const needles: string[] = [];
    for (const m of prelude.matchAll(/\[class([\^*])=("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')\s*\]/g)) {
        (m[1] === '^' ? prefixes : needles).push(decode(m[2]!.slice(1, -1)));
    }
    return { prefixes, needles };
}

/** Whether the rule's class tests accept this `class` attribute value. */
function matches(value: string): boolean {
    const { prefixes, needles } = classTests(hiddenRule().prelude);
    return prefixes.some((p) => value.startsWith(p)) || needles.some((n) => value.includes(n));
}

/** A selector list cut at its top-level commas: not those inside `()`, `[]` or a string. */
function topLevel(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote = '';
    let from = 0;
    for (let i = 0; i < list.length; i++) {
        const c = list[i]!;
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 0) {
            parts.push(list.slice(from, i).trim());
            from = i + 1;
        }
    }
    parts.push(list.slice(from).trim());
    return parts.filter(Boolean);
}

describe('hidden means hidden', () => {
    it('base.css restores display: none for an aparte- class carrying hidden', () => {
        expect(hiddenRule().body).toMatch(/display:\s*none\s*!important/);
    });

    it('is scoped by prefix, never a bare [hidden] that would restyle the host page', () => {
        expect(base).not.toMatch(/(?:^|[\s,])\[hidden\]\s*\{/);
        expect(classTests(hiddenRule().prelude).prefixes, 'the rule must test the class attribute').not.toHaveLength(0);
    });

    describe('whatever separates the class names', () => {
        it('matches an aparte- class that comes first', () => {
            expect(matches('aparte-card__footer')).toBe(true);
            expect(matches('aparte-card aparte-card__footer')).toBe(true);
        });

        it.each(SEPARATORS)('matches an aparte- class after a %s', (_name, separator) => {
            expect(matches(`my-footer${separator}aparte-card__footer`)).toBe(true);
        });

        it.each(SEPARATORS)('matches an aparte- class after a leading %s', (_name, separator) => {
            expect(matches(`${separator}aparte-card__footer`)).toBe(true);
        });

        it('leaves alone a class that only contains the prefix, or follows a character that is not whitespace', () => {
            expect(matches('my-aparte-card')).toBe(false);
            expect(matches('x_aparte-card')).toBe(false);
            // U+00A0, the no-break space, is not an HTML class separator: it is part of a class name.
            expect(matches(`${String.fromCharCode(0xa0)}aparte-card`)).toBe(false);
            expect(matches('')).toBe(false);
        });

        it('writes no raw line break inside a selector string, where the string would end', () => {
            for (const m of hiddenRule().prelude.matchAll(/"([^"]*)"/g)) expect(m[1]).not.toMatch(/[\n\r\f]/);
        });
    });

    it('leaves hidden="until-found" to the browser, whose find-in-page reveals it', () => {
        // `display: none` would defeat the reveal: the UA hides this state with `content-visibility: hidden`.
        const selectors = topLevel(hiddenRule().prelude);
        expect(selectors).not.toHaveLength(0);
        for (const selector of selectors) {
            expect(selector).toMatch(/:not\(\s*\[hidden=("|')?until-found\1?(?:\s+i)?\s*\]\s*\)/);
        }
    });
});
