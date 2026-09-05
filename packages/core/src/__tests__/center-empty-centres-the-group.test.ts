/**
 * `center-empty` centres the welcome group, not a stack that still holds the empty
 * transcript (UI audit — LOT 15.3, reshaped 2026-09-05).
 *
 * Measured on the built empty-state demo at 768: the chat's centre at 240, the centre of
 * what a visitor sees (the greeting, the starters, the composer) at 256 — 16px low, which
 * was half of the 32px the EMPTY viewport still stood at under `justify-content: center`:
 * the rows' wrapper kept its block padding with no row inside it, so the centring counted
 * three items of which the first was invisible and not nothing.
 *
 * The centring is a spacer now (shell.css): the viewport and a `::after` after the
 * composer both grow while the chat is empty, so the group sits between two EQUAL halves
 * whatever the empty viewport holds — its padding is inside its half, not between the
 * halves. No rule zeroes the viewport any more, and none needs to: what this test holds
 * is that the halves are symmetric — same basis, same growth — on both shell shapes.
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

describe.each([
    ['aparte-chat[center-empty] > aparte-chat-viewport', 'aparte-chat[center-empty]::after', 'aparte-chat[center-empty][data-empty]::after'],
    ['.aparte-chat-container--auto-center aparte-chat-viewport.aparte-viewport--framework', '.aparte-chat-container--auto-center::after', '.aparte-chat-container--auto-center[data-aparte-empty]::after'],
])('the empty group under %s', (viewportSel, spacerSel, emptySpacerSel) => {
    it('sits between two equal halves: the viewport and the spacer share one basis and, empty, one growth', () => {
        expect(rule(viewportSel)).toMatch(/flex:\s*1 1 0%/);
        expect(rule(spacerSel)).toMatch(/flex:\s*0 1 0%/);
        expect(rule(emptySpacerSel)).toMatch(/flex-grow:\s*1/);
        expect(rule(viewportSel), 'the box is not capped — a capped box over padded content is a scroll surface').not.toMatch(/max-block-size:\s*0/);
    });
});
