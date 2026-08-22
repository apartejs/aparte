import { describe, it, expect, beforeEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { registerDefaultRenderers } from '../../../renderers/index.js';

/**
 * A segment is looked up by id to be updated or removed. Segments are appended as
 * DIRECT children of the segments container, but the lookup was a DESCENDANT
 * query — and `querySelector` returns the first match in document order.
 *
 * The sanitizer deliberately keeps `data-*` attributes (they are inert), and
 * sanitized model markdown renders INSIDE that same container. So a decoy
 * `data-segment-id` planted in an earlier segment's prose wins over the real
 * segment element.
 *
 * This is not only cosmetic: parser-generated ids are unguessable UUIDs, but tool
 * segments are `tool-${toolCallId}` and the MODEL chooses the tool-call id. Point
 * the update at a decoy and a rejected tool keeps rendering as still-running —
 * a spoof against the human-in-the-loop control.
 */
describe('<aparte-chat-bubble> — segment lookup is scoped to its own children', () => {
    beforeEach(() => { registerDefaultRenderers(); });

    function bubbleWithDecoy(realId: string) {
        const bubble = document.createElement('aparte-chat-bubble') as HTMLElement & {
            addSegment: (s: unknown) => void;
            updateSegment: (id: string, u: unknown) => void;
            removeSegment: (id: string) => void;
        };
        document.body.appendChild(bubble);

        // An earlier segment whose rendered content carries the decoy. Injected
        // directly, the way sanitized markdown would land in the DOM.
        bubble.addSegment({ id: 'seg-first', type: 'text', content: 'hello' });
        const container = bubble.querySelector('.aparte-segments');
        const first = container?.querySelector('[data-segment-id="seg-first"]');
        const decoy = document.createElement('span');
        decoy.setAttribute('data-segment-id', realId);
        decoy.textContent = 'DECOY';
        first?.appendChild(decoy);

        bubble.addSegment({ id: realId, type: 'text', content: 'real' });
        return { bubble, container, decoy };
    }

    it('updates the real segment, not a decoy planted in earlier prose', () => {
        const { bubble, container } = bubbleWithDecoy('tool-attacker-chosen');

        bubble.updateSegment('tool-attacker-chosen', { content: 'UPDATED' });

        const real = container?.querySelector(':scope > [data-segment-id="tool-attacker-chosen"]');
        expect(real, 'the real segment should exist as a direct child').toBeTruthy();
        expect(
            real?.textContent,
            'the update landed on the decoy — the real segment never changed',
        ).toContain('UPDATED');
    });

    it('removes the real segment, not the decoy', () => {
        const { bubble, container, decoy } = bubbleWithDecoy('tool-attacker-chosen');

        bubble.removeSegment('tool-attacker-chosen');

        expect(
            container?.querySelector(':scope > [data-segment-id="tool-attacker-chosen"]'),
            'the real segment survived — the decoy was removed instead',
        ).toBeNull();
        expect(decoy.isConnected, 'the decoy should be untouched').toBe(true);
    });
});
