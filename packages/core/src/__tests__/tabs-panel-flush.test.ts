/**
 * A tab panel can run to its edges.
 *
 * `.aparte-tabs__panel` pads its content by the tab's own inset, which a code view or a
 * preview frame does not want; the only way out was a selector of the host's own.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

describe('the flush tab panel', () => {
    it('drops the inset', () => {
        expect(readAparteStylesheet()).toMatch(/\.aparte-tabs__panel--flush\s*\{\s*padding:\s*0;\s*\}/);
    });
});
