/**
 * `center-empty` centres the welcome group, not a stack that still holds the empty
 * transcript (UI audit — LOT 15.3).
 *
 * Measured on the built empty-state demo at 768: the chat's centre at 240, the centre of
 * what a visitor sees (the greeting, the starters, the composer) at 256 — 16px low, which
 * is half of the 32px the EMPTY viewport still stood at (its container's block padding).
 * `justify-content: center` centred the three items; the first was invisible and not
 * nothing. While the chat is empty the viewport takes no block room at all: capped at 0
 * and clipped, so its automatic flex minimum is 0 too. Its inline geometry is untouched —
 * the composer's inset is measured from it, and a rect of zero height still has a left.
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
    it.each([
        ['core mode', 'aparte-chat[center-empty][data-empty] > aparte-chat-viewport'],
        ['framework mode', '.aparte-chat-container--auto-center[data-aparte-empty] aparte-chat-viewport.aparte-viewport--framework'],
    ])('takes no block room in %s, so the group centres on itself', (_mode, selector) => {
        const empty = rule(selector);
        expect(empty, selector).toMatch(/flex-grow:\s*0/);
        expect(empty, selector).toMatch(/max-block-size:\s*0/);
        expect(empty, 'clipped: overflow other than visible is what makes the flex minimum 0').toMatch(/overflow:\s*hidden/);
    });
});
