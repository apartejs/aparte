/**
 * `center-empty` centres the welcome group, not a stack that still holds the empty
 * transcript (UI audit — LOT 15.3).
 *
 * Measured on the built empty-state demo at 768: the chat's centre at 240, the centre of
 * what a visitor sees (the greeting, the starters, the composer) at 256 — 16px low, which
 * is half of the 32px the EMPTY viewport still stood at: the rows' wrapper keeps its
 * block padding with no row inside it. `justify-content: center` centred the three
 * items; the first was invisible and not nothing.
 *
 * The padding goes, not the box. A first fix capped the viewport at 0 and clipped it;
 * that left a 32px scroll surface inside a 0px box, and the browser smoke test every
 * example runs — "an empty transcript must not overflow its box" — went red on nine
 * projects. Framework mode is left alone: there the viewport is the scroll surface and
 * may hold the wrapper's own empty-state content, so its height is not core's to take.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const shell = strip(readFileSync(resolve(coreRoot(), 'src/styles/components/shell.css'), 'utf8'));
const rule = (selector: string) => {
    for (const m of shell.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).includes(selector)) return m[2]!;
    }
    return '';
};

describe('the empty viewport under center-empty', () => {
    it('does not grow, and its rows’ wrapper carries no block padding, so the group centres on itself', () => {
        const viewport = rule('aparte-chat[center-empty][data-empty] > aparte-chat-viewport');
        expect(viewport).toMatch(/flex-grow:\s*0/);
        expect(viewport, 'the box is not capped — a capped box over padded content is a scroll surface').not.toMatch(/max-block-size:\s*0/);
        const wrapper = rule('aparte-chat[center-empty][data-empty] > aparte-chat-viewport .aparte-messages-wrapper');
        expect(wrapper).toMatch(/padding-block:\s*0/);
    });
});
