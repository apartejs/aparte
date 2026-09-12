import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

/**
 * The composer toolbar WRAPS, so a second control is never pushed off the composer.
 *
 * The row is `display: flex` with no wrap, and `aparte-select` carries
 * `min-width: var(--aparte-select-min-width)` (200px) on the HOST — a hard floor, so the
 * item cannot shrink. Two selects is 400px of controls that neither shrink nor move, and
 * the documented arrangement puts two there: the approval switch (the plugin's own
 * `@example` says "beside the model selector, in the composer's toolbar") and the model
 * selector, which every example renders under `?selector=toolbar`.
 *
 * Measured in Chromium at 390px — the width this repo's own responsive suite calls a
 * phone: the model selector's right edge sat at 449 against a 390px viewport, and
 * `documentElement.scrollWidth === clientWidth`, so the page did not even scroll to it.
 * An ancestor clipped it: the model picker was unreachable, not merely ugly. RTL mirrored
 * it exactly (`x = -59`), which is what says it is a shrink failure and not a direction
 * bug. Removing the approval switch made it fit at every width down to 360.
 *
 * The row is the fix, not the examples — a documented arrangement that needs an inline
 * `style` to work is a missing knob. Wrapping keeps the auto margin honest, too: an
 * end-aligned control is pushed to the end of ITS line.
 */
describe('the composer toolbar', () => {
    /** Comments stripped first: a rule quoted in one would otherwise count as a rule. */
    const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');

    const row = css.match(/aparte-composer-toolbar,\s*\.aparte-composer-footer\s*\{([^}]*)\}/)?.[1] ?? '';

    it('is the flex row the element and the legacy class share', () => {
        expect(row, 'the toolbar rule was not found in the stylesheet').not.toBe('');
        expect(row).toMatch(/display:\s*flex/);
    });

    it('wraps, so a control that does not fit goes to the next line instead of off the row', () => {
        expect(row).toMatch(/flex-wrap:\s*wrap/);
    });
});
