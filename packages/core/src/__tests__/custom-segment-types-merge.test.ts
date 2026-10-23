/**
 * A segment type of an app's own joins `AparteSegment` by declaration merging — no cast.
 *
 * `addSegment`, `appendMessage` and `AparteMessage.segments` took the closed union of core's
 * built-ins, so a `chart` segment had to be written `chart as unknown as AparteSegment`, which
 * the segments guide showed. `AparteSegmentTypes` is the interface to merge into; each entry
 * joins the union. The assertions here are the TYPES: `pnpm typecheck:tests` compiles this file,
 * and before the interface existed the two assignments below did not compile.
 */
import { describe, it, expect } from 'vitest';
import type { AparteMessage, AparteSegment, AparteSegmentBase } from '../types/index.js';

declare module '../types/segments.js' {
    interface AparteSegmentTypes {
        'test-chart': AparteSegmentBase & { type: 'test-chart'; data: { label: string; value: number }[] };
    }
}

describe('a merged segment type', () => {
    it('is an AparteSegment, and a message carries it', () => {
        const chart: AparteSegment = { id: 'c1', type: 'test-chart', data: [{ label: 'Q1', value: 4 }] };
        const message: AparteMessage = { id: 'm1', role: 'assistant', content: '', timestamp: 1, segments: [chart] };
        expect(message.segments?.[0]?.type).toBe('test-chart');
    });

    it('narrows on its type like a built-in', () => {
        const segment = { id: 'c2', type: 'test-chart', data: [] } as AparteSegment;
        if (segment.type === 'test-chart') expect(segment.data).toEqual([]);
    });
});
