/**
 * Every looping animation core ships stops under `prefers-reduced-motion: reduce`
 * (UI audit LOT 3).
 *
 * The repo has two mechanisms and a hole between them. `responsive.css` sets the
 * duration tokens to 0.01ms under reduce, and sweeps every descendant of aparté's own
 * elements (`aparte-chat-bubble *` …) to one 0.01ms iteration. A kit RECIPE used
 * outside those elements — a spinner in a consumer's toolbar, a skeleton in a card, an
 * indeterminate progress bar — gets neither: the token reset leaves `infinite` in
 * place, so the animation keeps running at 0.01ms per cycle, which on screen is a
 * flicker, not stillness. `display/icon.css` already handles its own loop the right
 * way (`animation: none` under reduce); this suite asks the same of every other loop.
 *
 * A loop is covered when its selector is either a descendant of a swept element, or
 * named exactly by a rule inside `@media (prefers-reduced-motion: reduce)` that sets
 * `animation: none`.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet';

interface Rule {
    selectors: string[];
    ancestors: string[];
    body: string;
}

/** A small walk over the corpus: every leaf block with the at-rules above it. */
function parseRules(css: string): Rule[] {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const rules: Rule[] = [];
    const stack: { header: string; bodyStart: number; hasChild: boolean }[] = [];
    let headerStart = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') {
            const header = text.slice(headerStart, i).trim();
            const parent = stack[stack.length - 1];
            if (parent) parent.hasChild = true;
            stack.push({ header, bodyStart: i + 1, hasChild: false });
            headerStart = i + 1;
        } else if (ch === '}') {
            const frame = stack.pop();
            if (frame && !frame.hasChild) {
                rules.push({
                    selectors: frame.header.split(',').map((s) => s.trim()).filter(Boolean),
                    ancestors: stack.map((f) => f.header),
                    body: text.slice(frame.bodyStart, i),
                });
            }
            headerStart = i + 1;
        } else if (ch === ';') {
            headerStart = i + 1;
        }
    }
    return rules;
}

const REDUCE = /prefers-reduced-motion:\s*reduce/;
const LOOP = /animation(?:-iteration-count)?\s*:[^;]*\binfinite\b/;
const STOPPED = /animation(?:-name)?\s*:\s*none\b/;

const rules = parseRules(readAparteStylesheet());
const underReduce = (r: Rule) => r.ancestors.some((a) => REDUCE.test(a));

/** The elements `responsive.css` sweeps: `aparte-x *` rules under reduce. */
const sweptTags = new Set(
    rules
        .filter(underReduce)
        .filter((r) => /animation-iteration-count\s*:\s*1\b/.test(r.body))
        .flatMap((r) => r.selectors)
        .map((s) => s.match(/^(aparte-[\w-]+)\s+\*$/)?.[1])
        .filter((t): t is string => Boolean(t)),
);

const stoppedSelectors = new Set(
    rules.filter(underReduce).filter((r) => STOPPED.test(r.body)).flatMap((r) => r.selectors),
);

/** True when the animated element sits under one of the swept elements. */
function underSweptElement(selector: string): boolean {
    const compounds = selector.split(/\s+|>/).filter(Boolean);
    return compounds.slice(0, -1).some((c) => {
        const tag = c.match(/^(aparte-[\w-]+)/)?.[1];
        return tag !== undefined && sweptTags.has(tag);
    });
}

const loops = rules.filter((r) => !underReduce(r) && LOOP.test(r.body)).flatMap((r) => r.selectors);

describe('prefers-reduced-motion stops every looping animation core ships', () => {
    it('read the corpus: the sweep and the loops are both there', () => {
        expect(sweptTags.size, 'the reduce sweep in responsive.css was not found').toBeGreaterThanOrEqual(5);
        expect(loops.length, 'fewer looping animations than the kit is known to draw').toBeGreaterThanOrEqual(6);
    });

    it.each(loops)('%s stops under reduce', (selector) => {
        const covered = underSweptElement(selector) || stoppedSelectors.has(selector);
        expect(
            covered,
            `${selector} keeps an infinite animation under prefers-reduced-motion: reduce — the token reset ` +
                'only shortens the cycle to 0.01ms, which flickers. Add a reduce block in its sheet that sets ' +
                '`animation: none` (the way display/icon.css does), or move it under a swept element.',
        ).toBe(true);
    });
});
