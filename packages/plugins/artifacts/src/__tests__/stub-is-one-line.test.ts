/**
 * The "Not created" / "Waiting" block is one line, spaced like a card.
 *
 * It asked for a flex row and inherited `flex-direction: column` from the `.aparte-card`
 * recipe it wears: the badge and the title stacked, centred, the state word alone at the
 * bottom — a 101px box that looked broken rather than quiet — and consecutive blocks
 * touched, with none of the vertical rhythm a card has between messages.
 */
import { describe, it, expect } from 'vitest';
import css from '../artifact.css?raw';

const sheet = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const ruleFor = (selector: string): string => {
    const at = sheet.indexOf(`${selector} {`);
    expect(at, `a rule for ${selector}`).toBeGreaterThan(-1);
    return sheet.slice(at, sheet.indexOf('}', at));
};

describe('the artifact stub', () => {
    it('lays out as a row, whatever the card recipe says', () => {
        expect(ruleFor('.aparte-art-stub')).toMatch(/flex-direction:\s*row/);
    });

    it('takes a card\'s vertical rhythm', () => {
        expect(sheet).toMatch(/\.aparte-art-stub\s*\{[^}]*margin:\s*var\(--aparte-space-4\)\s+0/);
    });
});
