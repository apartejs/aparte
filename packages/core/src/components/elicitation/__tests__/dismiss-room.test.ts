/**
 * The question's text does not run under the corner "Skip" (#50).
 *
 * `.aparte-elic-dismiss` is absolutely positioned in the panel's top corner, so
 * nothing in the flow knows it is there: a message long enough to reach the panel's
 * edge printed its first line underneath the button — measured at 43px of text under
 * "Skip" in a 460px panel, and the overlap is locale-dependent because the button
 * holds a word ("Skip" ~40px, "Passer" ~53px).
 *
 * The panel already owns the answer: `--aparte-elic-dismiss-room`, the space the tab
 * rail (`.aparte-elic-steps`) keeps clear for the same corner. The message reserves
 * the same room, from the same token, so the two can never disagree and a locale
 * whose word is wider bumps ONE value.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

describe('elicitation message — room for the corner escape', () => {
    const sheet = readAparteStylesheet();

    it('the message reserves the dismiss room at its inline end', () => {
        const message = sheet.match(/\.aparte-elic-message\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(message).toMatch(/margin:\s*0 var\(--aparte-elic-dismiss-room\) var\(--aparte-space-3\) var\(--aparte-space-3\)/);
    });

    it('from the same token the tab rail already reserves', () => {
        const steps = sheet.match(/\.aparte-elic-steps\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(steps).toMatch(/var\(--aparte-elic-dismiss-room\)/);
    });
});
