/**
 * The progress renderer, whose contract is mostly its ARIA.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

describe('default renderer: progress (ARIA)', () => {
    it('exposes a progressbar role with aria-value* and a label', () => {
        const renderer = getSegmentRenderer('progress')!;
        const html = renderer.render({ id: 'p1', type: 'progress', label: 'Uploading', percent: 42 } as never);
        expect(html).toContain('role="progressbar"');
        expect(html).toContain('aria-valuemin="0"');
        expect(html).toContain('aria-valuemax="100"');
        expect(html).toContain('aria-valuenow="42"');
        expect(html).toContain('aria-label="Uploading"');
    });
});
