/**
 * The options' focus ring is not clipped by the panel's scroll container.
 *
 * `.aparte-elic-body` scrolls (`overflow-y: auto`), and a scroll container clips at
 * its padding edge. An option's ring is drawn outside its box — the recipe's outline
 * plus its offset — so a focused option lost its ring on every side: 4px cut left and
 * right, on a consumer's screenshot and then in a browser probe here. The sheet gives
 * the ring room with padding and takes it back with a negative margin, in the tokens
 * the ring itself reads, so a theme that widens the ring widens the room.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

describe('elicitation body — room for the focus ring', () => {
    const sheet = readAparteStylesheet();
    const body = sheet.match(/\.aparte-elic-body\s*\{([^}]*)\}/)?.[1] ?? '';

    it('scrolls, and pads by the ring (outline width + offset) while giving the space back', () => {
        expect(body).toMatch(/overflow-y:\s*auto/);
        expect(body).toMatch(/--aparte-elic-ring-room:\s*calc\(var\(--aparte-focus-outline-width\)\s*\+\s*var\(--aparte-focus-outline-offset\)\)/);
        expect(body).toMatch(/padding:\s*var\(--aparte-elic-ring-room\)/);
        expect(body).toMatch(/margin:\s*calc\(-1 \* var\(--aparte-elic-ring-room\)\)/);
        expect(body).toMatch(/scroll-padding:\s*var\(--aparte-elic-ring-room\)/);
    });

    it('reads the same tokens the choice recipe draws its ring with', () => {
        // If the ring ever moves to other tokens, the room must follow — this pins them together.
        const ring = sheet.match(/\.aparte-field-choice:has\(:focus-visible\)\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(ring).toMatch(/outline:\s*var\(--aparte-focus-outline-width\)/);
        expect(ring).toMatch(/outline-offset:\s*var\(--aparte-focus-outline-offset\)/);
    });
});
