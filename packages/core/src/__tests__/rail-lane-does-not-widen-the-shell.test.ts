/**
 * The rail's lane is padding INSIDE the shell, never added to its width.
 *
 * While a rail is in the chat, the shell leaves `--aparte-scroll-rail-room` at its end and the
 * rail sits in it. Under the Angular wrapper the rail's parent is `.aparte-chat-container`, a
 * `width: 100%` div with no `box-sizing` of its own: the lane's padding was added to that
 * width, the box overflowed `<aparte-chat>` (which clips), and the rail — absolutely placed in
 * the lane — landed entirely in the clipped strip, with no tick left to see. An app with a
 * global border-box reset never showed it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const css = readFileSync(resolve(coreRoot(), 'src/styles/components/scroll-rail.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('the rail lane', () => {
    it('is drawn in the shell\'s border box', () => {
        const lane = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
            .find((m) => m[1]!.includes('has(> aparte-scroll-rail:not([hidden]))') && /padding-inline-end:\s*var\(--aparte-scroll-rail-room\)/.test(m[2]!));
        expect(lane, 'the lane rule').toBeDefined();
        expect(lane![2]).toMatch(/box-sizing:\s*border-box/);
    });
});
