/**
 * A focused option's ring has room in the approval panel, whatever the ring's size.
 *
 * At 2px with a 2px gap the ring reaches 4px out. Two things were sized for the 1px flush
 * ring: the gap between approval options (4px, so a focused ring touched the next option's
 * border) and the panel's inline padding (the space unit's 2 steps, 3px at a denser unit,
 * under the 4px the body borrows with its negative margin — the panel cut 1px off each side).
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

const sheet = readAparteStylesheet();
const REACH = 'calc(var(--aparte-focus-outline-width) + var(--aparte-focus-outline-offset)';

describe('the approval panel leaves the focus ring room', () => {
    it('spaces its options wider than the ring reaches', () => {
        const rule = sheet.match(/\.aparte-approval-options\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(rule).toContain(`gap: var(--aparte-approval-gap, ${REACH} + var(--aparte-space-1)))`);
    });

    it("pads its sides by at least the ring's reach, at any space unit", () => {
        expect(sheet).toContain(`--aparte-elic-padding: var(--aparte-space-3) max(var(--aparte-space-2), ${REACH}));`);
    });
});
