/**
 * A card's body neutralises the outer margins of its content (UI audit, visual half —
 * LOT 29).
 *
 * `.aparte-card__body` pads itself and lets a `<p>` inside bring its own block margins
 * on top: the sheet's own example puts a paragraph there and the body band measured
 * twice the height of its header and footer (74px against 37 and 38). The recipe owns
 * its edges — the first child's leading margin and the last child's trailing margin
 * fold into the padding, the way every prose container in the library already does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const card = readFileSync(resolve(process.cwd(), 'src/styles/display/card.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('the card body', () => {
    it('folds its first child’s leading margin into its padding', () => {
        expect(card).toMatch(/\.aparte-card__body\s*>\s*:first-child\s*\{[^}]*margin-block-start:\s*0/);
    });

    it('and its last child’s trailing margin', () => {
        expect(card).toMatch(/\.aparte-card__body\s*>\s*:last-child\s*\{[^}]*margin-block-end:\s*0/);
    });
});
