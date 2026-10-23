/**
 * A Markdown table's aligned columns stay aligned.
 *
 * `| a | b |` over `|---|---:|` makes the renderer emit `<td align="right">`, which a browser
 * reads as a `text-align` hint of the lowest weight. The prose sheet set `text-align: start`
 * on every cell, so any author rule beat the hint and every column started at the start.
 * The rule now applies to the cells nobody aligned.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

describe('prose tables', () => {
    const sheet = readAparteStylesheet();

    it('set no alignment on every cell', () => {
        const cells = sheet.match(/\.aparte-content th,[^{]*\.aparte-thinking-content td\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(cells, 'the shared cell rule was found').toContain('padding');
        expect(cells).not.toMatch(/text-align/);
    });

    it('start only the cells no column alignment reached', () => {
        // Inside `:where`, so the rule weighs what the old one did and a consumer's cell rule still wins.
        expect(sheet).toMatch(/:is\(th, td\):where\(:not\(\[align\]\)\)\s*\{\s*text-align:\s*start;/);
    });
});
