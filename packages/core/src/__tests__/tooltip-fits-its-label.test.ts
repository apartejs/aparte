/**
 * A tooltip is as wide as its label (UI audit, visual half — LOT 31).
 *
 * `.aparte-tooltip` declared a `max-width` and no intrinsic width, so as an
 * absolutely-positioned box it shrank to `min-content`: "Copy to clipboard" broke into
 * two lines at every width — 71×40px, the widest word plus padding. `width: max-content`
 * lets the label sit on one line, with the same `max-width` as the ceiling for a long one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const tooltip = readFileSync(resolve(coreRoot(), 'src/styles/surface/tooltip.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const rule = tooltip.match(/(?:^|\n)\.aparte-tooltip\s*\{([^}]*)\}/)?.[1] ?? '';

describe('the tooltip', () => {
    it('takes the width of its label, capped by max-width', () => {
        expect(rule).toMatch(/width:\s*max-content/);
        expect(rule).toMatch(/max-width:\s*var\(--aparte-tooltip-max-width\)/);
    });
});
