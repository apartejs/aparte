/**
 * The plain-text renderer.
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

describe('default renderer: text', () => {
    it('is registered', () => {
        expect(getSegmentRenderer('text')).toBeDefined();
    });

    it('renders segment content', () => {
        const renderer = getSegmentRenderer('text')!;
        const seg = { id: 's1', type: 'text', content: 'Hello World' };
        const html = renderer.render(seg as any);
        expect(html).toContain('Hello World');
    });
});
