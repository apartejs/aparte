import { describe, it, expect, vi } from 'vitest';

/**
 * `fallback` belongs to every segment, not only to `type: 'custom'`.
 *
 * The renderer has always read it structurally — `unrenderedSegment` in
 * `aparte-chat-bubble` takes `{ type, fallback? }` and draws the sentence whatever the
 * type is — while the declaration sat on `AparteCustomSegment` alone. So the one shape
 * that needs it most, a consumer's own type arriving where its renderer is not
 * registered, could not type the field it was about to be rendered from.
 *
 * Two halves, and they fail in two different runs. The literal below is checked by
 * `pnpm typecheck:tests` (vitest only transpiles); the render is checked here.
 */

import '../../components/bubble/aparte-chat-bubble.js';
import { AparteClient } from '../../client/aparte-client.js';
import type { AparteSegment, AparteSegmentBase, AparteTextSegment } from '../index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

describe('AparteSegmentBase.fallback', () => {
    it('types on a built-in segment, not only on a custom one', () => {
        const segment: AparteTextSegment = {
            id: 's1',
            type: 'text',
            content: 'A transport is the object that talks to the model.',
            fallback: 'A transport is the object that talks to the model.',
        };
        expect(segment.fallback).toBe(segment.content);
    });

    it('types on a segment of your own, with no cast', () => {
        // The other half of the same declaration move, and the shape the changeset shows:
        // a consumer's type is the base plus a `type` of its own, and the base is where
        // `fallback` now lives. `AparteSegment` stays the closed union of the built-ins,
        // so this type is not a member of it — it does not need to be, because the bubble
        // reads the field structurally.
        type CitationSegment = AparteSegmentBase & { type: 'citation'; url: string };
        const citation: CitationSegment = {
            id: 's2',
            type: 'citation',
            url: 'https://example.org/weather',
            fallback: 'Weather report, 6 September.',
        };
        expect(citation.fallback).toBe('Weather report, 6 September.');
    });

    it('is drawn for a type core knows nothing about', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        new AparteClient();

        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('message-id', 'm-citation');
        document.body.appendChild(el);
        el.setSegments([
            { id: 's1', type: 'citation', fallback: 'Weather report, 6 September.' } as unknown as AparteSegment,
        ]);

        expect(el.querySelector('.aparte-segment-fallback')?.textContent).toBe('Weather report, 6 September.');
        expect(el.textContent).not.toContain('Unknown segment type');
        el.remove();
        warn.mockRestore();
    });
});
