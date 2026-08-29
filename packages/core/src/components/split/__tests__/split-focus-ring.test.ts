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

    it('draws a solid outline in the focus-border colour', () => {
        expect(rule).toMatch(/outline:\s*var\(--aparte-focus-outline-width\)\s+solid\s+var\(--aparte-border-focus\)/);
        expect(rule).toMatch(/outline-offset:\s*0/);
    });

    it('never suppresses the outline', () => {
        // The exact declaration that made the ring the only indicator. A substitute is
        // fine, silence is not.
        expect(rule).not.toMatch(/outline:\s*none/);
    });

    it('keeps the ring as decoration beside it, not instead of it', () => {
        expect(rule).toMatch(/box-shadow:\s*var\(--aparte-focus-ring\)/);
    });

    it('is still restated for forced colours, which drop box-shadow entirely', () => {
        // Windows high contrast repaints colours and drops shadows: the entry in
        // responsive.css now overrides an outline that exists rather than substituting
        // for one that does not — but it must still be there.
        const forced = sheet.slice(sheet.indexOf('@media (forced-colors: active)'));
        expect(forced).toMatch(/\.aparte-split__handle:focus-visible/);
    });
});
