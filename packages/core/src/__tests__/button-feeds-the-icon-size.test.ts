/**
 * The button recipe sizes an `<aparte-icon>` inside it (UI audit, visual half — LOT 14).
 *
 * `button.css` sized the glyph with `.aparte-btn > svg { width/height: var(--aparte-btn-icon-size) }`.
 * That reaches a raw SVG child — what core's own buttons emit through `getIcon()` — and
 * nothing else: `<aparte-icon>` renders its `<svg>` INSIDE itself, a grandchild, so the
 * documented markup (`<button class="aparte-btn aparte-btn--icon"><aparte-icon name="…">`)
 * kept the icon at its loose 14px default in a button that asked for 16, and `--lg`'s
 * 20 never applied. Measured on the icon preview: the glyph mis-sized and the button
 * riding 3px high beside it.
 *
 * The recipe feeds the icon's own knob instead — `--aparte-icon-size` inherits, and both
 * the element and a raw `svg.aparte-icon` read it — which is also how the accordion's
 * chevron is sized since LOT 4.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const button = readFileSync(resolve(coreRoot(), 'src/styles/button.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('the button recipe and its icon', () => {
    it('feeds --aparte-icon-size from --aparte-btn-icon-size on the button itself', () => {
        const block = button.match(/(?:^|\n)\.aparte-btn\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(block).toMatch(/--aparte-icon-size\s*:\s*var\(--aparte-btn-icon-size\)/);
    });

    it('an <aparte-icon> child takes no pointer, like a raw svg', () => {
        expect(button).toMatch(/\.aparte-btn\s*>\s*aparte-icon[^{]*\{[^}]*pointer-events:\s*none/);
    });
});
