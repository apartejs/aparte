/**
 * The split's seam is a 1px line in a 12px track, with a grip when the pointer is on it
 * (UI audit — T19, taken by Paul).
 *
 * One token sized both the grid track and the painted seam, so the line could not be
 * thinned without moving the layout; at 4px it was four times the kit's rule and had no
 * grip — an interaction drawn as a decoration. Now the track is 12px (the grab zone),
 * the seam painted inside it is the kit's border width, and under the pointer or a drag
 * the handle shows a short grip in the middle — the convention of every editor's split.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const STYLES = resolve(coreRoot(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const theme = strip(readFileSync(resolve(STYLES, 'theme.css'), 'utf8'));
const split = strip(readFileSync(resolve(STYLES, 'shell/split.css'), 'utf8'));
const rule = (selector: string) => {
    for (const m of split.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};

describe('the split seam', () => {
    it('the track is 12px and the seam is the kit’s rule', () => {
        expect(theme).toMatch(/--aparte-split-handle-size:\s*12px/);
        expect(theme).toMatch(/--aparte-split-seam-width:\s*var\(--aparte-border-width\)/);
    });

    it('the handle is a transparent track and paints its seam as a line inside it', () => {
        expect(rule('.aparte-split__handle')).toMatch(/background:\s*transparent/);
        const seam = rule('.aparte-split__handle::before');
        expect(seam).toMatch(/inline-size:\s*var\(--aparte-split-seam-width\)/);
        expect(seam).toMatch(/background:\s*var\(--aparte-border\)/);
    });

    it('shows a grip under the pointer and while dragging', () => {
        const grip = rule('.aparte-split__handle:hover');
        expect(grip).toMatch(/background-image:\s*linear-gradient\(/);
        expect(split).toMatch(/\.aparte-split__handle\[data-dragging\]/);
    });
});
