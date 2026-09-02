/**
 * The seam's focus indicator is an OUTLINE, not a wash.
 *
 * `.aparte-split__handle:focus-visible` used to be `outline: none` plus
 * `box-shadow: var(--aparte-focus-ring)` and nothing else. The ring measures 1.39:1
 * against the page in the light palette and 1.83:1 in the dark one, where WCAG asks
 * 3:1 of a focus indicator — so the seam's only keyboard affordance was, in practice,
 * absent: a 4px band with `border: 0` whose entire story is arrowing it.
 *
 * A separate file rather than a case inside `split.test.ts` because it asserts on the
 * SHEET, not on the element: jsdom neither resolves `var()` nor applies a stylesheet
 * it was never handed, so no unit test here can measure the contrast. What it can do —
 * and what the ratio depended on — is pin that the rule declares a solid outline at
 * all, and that `outline: none` has not come back. The measured contrast belongs to
 * `pnpm e2e`; the source-shape half belongs here. Precedent: `ring-room.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

describe('the split seam — a focus ring you can see', () => {
    const sheet = readAparteStylesheet();
    const rule = sheet.match(/\.aparte-split__handle:focus-visible\s*\{([^}]*)\}/)?.[1] ?? '';

    it('has a :focus-visible rule at all', () => {
        expect(rule, 'the seam lost its :focus-visible rule, or the selector was renamed').not.toBe('');
    });

    it('draws the one ring every control draws: a solid outline in the focus colour, one step outside the box', () => {
        expect(rule).toMatch(/outline:\s*var\(--aparte-focus-outline-width\)\s+solid\s+var\(--aparte-border-focus\)/);
        expect(rule).toMatch(/outline-offset:\s*var\(--aparte-focus-outline-offset\)/);
    });

    it('never suppresses the outline', () => {
        // The exact declaration that made the ring the only indicator. A substitute is
        // fine, silence is not.
        expect(rule).not.toMatch(/outline:\s*none/);
    });

    it('draws no wash beside it — the soft box-shadow ring is gone from the kit (UI audit, LOT 2)', () => {
        expect(rule).not.toMatch(/box-shadow/);
    });

    it('needs no forced-colours restatement: an outline is painted there on its own', () => {
        // The entry in responsive.css used to exist because a box-shadow ring vanishes
        // under forced colours. The ring is an outline now, and forced colours paint it.
        // Every forced-colours block in the corpus (several sheets carry one), none of
        // which may name the seam's focus rule any more.
        const blocks = [...sheet.matchAll(/@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]!);
        expect(blocks.length).toBeGreaterThan(0);
        for (const block of blocks) expect(block).not.toMatch(/\.aparte-split__handle:focus-visible/);
    });
});
