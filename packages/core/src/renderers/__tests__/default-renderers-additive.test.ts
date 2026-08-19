import { describe, it, expect, afterEach } from 'vitest';

/**
 * The built-in renderers install themselves the first time a segment needs one.
 *
 * Here: filling in the built-ins is strictly ADDITIVE. A renderer the app
 * registered itself is never replaced — so a custom `text` renderer survives the
 * sweep that a `code` segment triggers.
 *
 * Own file because it needs a registry nothing has filled yet (vitest isolates per
 * file), which is also the real-world state: the app registers at startup.
 */

import '../../components/bubble/aparte-chat-bubble.js';
import { getSegmentRenderer, registerSegmentRenderer } from '../segment-renderers.js';
import type { AparteSegment } from '../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

function bubbleWith(segments: AparteSegment[]): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('role', 'assistant');
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

describe('the lazy install never overwrites a renderer the app registered', () => {
    it('keeps a custom `text` renderer while filling in the missing built-ins', () => {
        registerSegmentRenderer({
            type: 'text',
            render: () => '<div class="mine">MINE</div>',
        });

        // A *different* built-in type triggers the lazy install...
        const el = bubbleWith([
            { id: 's1', type: 'code', content: 'print(1)', language: 'python' } as AparteSegment,
            { id: 's2', type: 'text', content: 'hello' } as AparteSegment,
        ]);
        mounted.push(el);

        // ...the built-in `code` renderer is now there,
        expect(el.querySelector('.segment-code, .code-content-wrapper')).not.toBeNull();
        // ...and `text` is still the app's.
        expect(el.querySelector('.mine')?.textContent).toBe('MINE');
        expect(el.textContent).not.toContain('Unknown segment type');
        expect(getSegmentRenderer('text')?.render({ id: 'x', type: 'text' } as AparteSegment))
            .toContain('MINE');
    });
});
