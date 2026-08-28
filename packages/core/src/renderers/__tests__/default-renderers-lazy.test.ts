import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * The built-in renderers install themselves the first time a segment needs one.
 *
 * The bug this file pins: `registerDefaultRenderers()` had exactly ONE caller —
 * `new AparteClient()`. An app on the "bring your own loop" path (which the guide
 * tells you NOT to construct a client on) got `[Unknown segment type: text]` for
 * every reply: bubbles, streaming and scrolling all worked, only the CONTENT was
 * missing, so it reads as a bug in the consumer's own loop.
 *
 * This file must NOT call registerDefaultRenderers() — the whole point is what
 * happens when nobody did. Vitest isolates per file, so the registry starts empty:
 * the "app registered its own" case therefore lives in its own file, since it has
 * to run against a registry nothing has filled yet.
 */

import '../../components/bubble/aparte-chat-bubble.js';
import { getSegmentRenderer } from '../segment-renderers.js';
import type { AparteSegment } from '../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

function bubbleWith(segments: AparteSegment[]): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', `m-${Math.random().toString(36).slice(2)}`);
    document.body.appendChild(el);
    el.setSegments(segments);
    return el;
}

const mounted: HTMLElement[] = [];
afterEach(() => {
    mounted.splice(0).forEach((el) => el.remove());
    document.body.innerHTML = '';
});

describe('default segment renderers install themselves on demand', () => {
    it('renders a built-in segment type with nobody having registered anything', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const el = bubbleWith([{ id: 's1', type: 'text', content: 'hello there' } as AparteSegment]);
        mounted.push(el);

        expect(el.textContent).toContain('hello there');
        expect(el.textContent).not.toContain('Unknown segment type');
        // And no scolding: the "did you call registerDefaultRenderers()?" warning is
        // for genuinely unknown types now, not for the out-of-the-box path.
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('still falls back (and warns) for a type nobody can render', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const el = bubbleWith([{ id: 's1', type: 'my_widget', content: 'x' } as unknown as AparteSegment]);
        mounted.push(el);

        expect(el.textContent).toContain('Unknown segment type: my_widget');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('installs the built-ins for the imperative streaming path too (addSegment)', () => {
        const el = document.createElement('aparte-chat-bubble') as BubbleEl & {
            addSegment(s: AparteSegment): void;
        };
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('message-id', 'm-imperative');
        document.body.appendChild(el);
        mounted.push(el);

        el.addSegment({ id: 's1', type: 'thinking', content: 'pondering' } as AparteSegment);

        expect(el.textContent).not.toContain('Unknown segment type');
        expect(getSegmentRenderer('thinking')).toBeDefined();
    });
});
