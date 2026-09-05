/**
 * The centred composer glides to the bottom when a conversation opens, the way it
 * glides back up when a new one starts.
 *
 * Measured on the chat site (2026-09-05, top of the composer sampled every 40 ms):
 * a new chat glided 816 → 494 over ~300 ms, opening a conversation snapped 494 → 816
 * in one frame. `center-empty` animated the viewport's `flex-grow`, but the viewport
 * also carries `height: 100%` for the scroll chain — and the moment `data-empty`
 * dropped, that height applied at once, so `flex-grow` had nothing left to animate.
 * In the other direction the height went away and `flex-grow` did the sliding.
 *
 * Now the viewport keeps ONE size rule under the centring modes — `flex: 1 1 0%`, no
 * height — and the centring is a spacer after the composer (`::after`) whose
 * `flex-grow` is 1 while the chat is empty and 0 otherwise. Only the spacer animates,
 * in both directions, and the viewport's share follows. Same shape for the vanilla
 * `aparte-chat[center-empty]` and the wrappers' `.aparte-chat-container--auto-center`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from '../../../__tests__/read-stylesheet.js';

const shell = readFileSync(resolve(coreRoot(), 'src/styles/components/shell.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

/** The declarations of every rule whose selector list contains `selector` verbatim. */
const rulesFor = (selector: string): string[] => {
    const out: string[] = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(shell))) {
        if (m[1].split(',').map((s) => s.trim()).includes(selector)) out.push(m[2]);
    }
    return out;
};

describe.each([
    ['aparte-chat[center-empty]', 'aparte-chat[center-empty][data-empty]', 'aparte-chat[center-empty] > aparte-chat-viewport'],
    ['.aparte-chat-container--auto-center', '.aparte-chat-container--auto-center[data-aparte-empty]', '.aparte-chat-container--auto-center aparte-chat-viewport.aparte-viewport--framework'],
])('%s', (shellSel, emptySel, viewportSel) => {
    it('centres with a spacer whose flex-grow animates, not with justify-content', () => {
        expect(rulesFor(`${shellSel}::after`).join(' ')).toMatch(/transition:\s*flex-grow/);
        expect(rulesFor(`${emptySel}::after`).join(' ')).toMatch(/flex-grow:\s*1/);
        expect(rulesFor(emptySel).join(' ')).not.toMatch(/justify-content:\s*center/);
    });

    it('gives the viewport one size rule — a zero basis and no height — so nothing snaps', () => {
        const viewport = rulesFor(viewportSel).join(' ');
        expect(viewport).toMatch(/flex:\s*1 1 0%/);
        expect(viewport).toMatch(/height:\s*auto/);
        expect(viewport).not.toMatch(/height:\s*100%/);
        expect(viewport).not.toMatch(/transition:/);
        // The empty state no longer collapses the viewport: the spacer takes the other half.
        expect(rulesFor(`${emptySel} > aparte-chat-viewport`).join(' ')).not.toMatch(/flex-grow:\s*0/);
        expect(rulesFor(`${emptySel} aparte-chat-viewport.aparte-viewport--framework`).join(' ')).not.toMatch(/flex-grow:\s*0/);
    });
});
