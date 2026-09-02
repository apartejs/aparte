/**
 * A skeleton text line holds the place of the line it stands for (UI audit — T21).
 *
 * The placeholder bar was 12px on an 18px step while a line of content is 16.2px on a
 * ~27.5px step, so the moment the text arrived the layout jumped by a third of its height
 * for every line. A placeholder that does not hold the place it promises is not a
 * placeholder. The bar's height is the content's font size and its gap is the rest of
 * the content's line — both derived, on the element, from the two content tokens, so a
 * theme that changes the prose moves its skeleton with it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const theme = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('the skeleton text line', () => {
    it('is as tall as the content type', () => {
        expect(theme).toMatch(/--aparte-skeleton-text-height:\s*var\(--aparte-content-font-size\)/);
    });
    it('and its gap is the rest of the content line', () => {
        expect(theme).toMatch(/--aparte-skeleton-text-gap:\s*calc\(var\(--aparte-content-font-size\)\s*\*\s*\(var\(--aparte-content-line-height\)\s*-\s*1\)\)/);
    });
});
