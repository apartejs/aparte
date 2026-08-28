import { describe, it, expect, vi } from 'vitest';

/**
 * `new AparteClient({ autoRegister: false })` still means what it says.
 *
 * The built-ins install themselves on demand now (see default-renderers-lazy),
 * which would otherwise quietly turn that option into a no-op. Declining is a
 * decision, so it is remembered: nothing installs itself afterwards.
 *
 * Own file — the decline is a one-way latch for the process, exactly as the real
 * lifetime is (an app declines once, at startup).
 */

import '../../components/bubble/aparte-chat-bubble.js';
import { AparteClient } from '../../client/aparte-client.js';
import { getSegmentRenderer } from '../segment-renderers.js';
import type { AparteSegment } from '../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

describe('AparteClient({ autoRegister: false })', () => {
    it('keeps the built-ins out — the app said it brings its own', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        new AparteClient({ autoRegister: false });
        expect(getSegmentRenderer('text')).toBeUndefined();

        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('message-id', 'm-declined');
        document.body.appendChild(el);
        el.setSegments([{ id: 's1', type: 'text', content: 'hello' } as AparteSegment]);

        expect(el.textContent).toContain('Unknown segment type: text');
        expect(getSegmentRenderer('text')).toBeUndefined();
        el.remove();
        warn.mockRestore();
    });
});
