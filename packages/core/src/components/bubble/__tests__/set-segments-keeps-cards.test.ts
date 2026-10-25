/**
 * The host re-syncs a message when its turn ends — `setSegments()` with the same segments in
 * their final state. That used to clear and draw every segment again, so a card a framework
 * component holds was unmounted and mounted again at the end of every turn, losing whatever
 * state it had (a form half filled, a panel opened). Measured in all four framework examples:
 * two mounts for one call.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { defineMountedToolRenderer, registerDefaultRenderers } from '../../../renderers/index.js';
import type { AparteSegment, AparteToolCallSegment, AparteToolCallView } from '../../../types/index.js';

type Bubble = HTMLElement & {
    setSegments: (s: AparteSegment[]) => void;
    getSegments: () => AparteSegment[];
};

const call = (id: string, extra: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id, type: 'tool_call', status: 'pending', toolCall: { id: `call-${id}`, name: 'get_weather', input: { city: 'Paris' } }, ...extra,
} as AparteToolCallSegment);
const text = (id: string, content: string) => ({ id, type: 'text', content }) as AparteSegment;

function bubble(segments: AparteSegment[]): Bubble {
    const b = document.createElement('aparte-chat-bubble') as Bubble;
    document.body.appendChild(b);
    b.setSegments(segments);
    return b;
}

function recording() {
    const mounts: HTMLElement[] = [];
    const updates: AparteToolCallView[] = [];
    const destroy = vi.fn();
    aparteGlobalConfig.registerToolRenderer('get_weather', defineMountedToolRenderer((host, view) => {
        mounts.push(host);
        host.textContent = view.status;
        return { update: (next) => { updates.push(next); host.textContent = next.status; }, destroy };
    }));
    return { mounts, updates, destroy };
}

describe('a message re-synced with the same segments keeps the mounted cards', () => {
    beforeEach(() => { registerDefaultRenderers(); });
    afterEach(() => {
        aparteGlobalConfig.unregisterToolRenderer('get_weather');
        document.body.replaceChildren();
    });

    it('hands the card the final state instead of mounting it again', () => {
        const { mounts, updates, destroy } = recording();
        const b = bubble([call('t1'), text('x1', 'Looking…')]);
        const host = b.querySelector('.aparte-tool-ui');
        b.setSegments([call('t1', { status: 'resolved', result: 'Cloudy' }), text('x1', 'It is cloudy.')]);
        expect(mounts).toHaveLength(1);
        expect(destroy).not.toHaveBeenCalled();
        expect(updates.map((u) => u.status)).toEqual(['resolved']);
        expect(b.querySelector('.aparte-tool-ui')).toBe(host);
        expect(host?.textContent).toBe('resolved');
        // The other segments are drawn from the new state, as before.
        expect(b.querySelector('[data-segment-id="x1"]')?.textContent).toContain('It is cloudy.');
    });

    it('updateMessage({ segments }) keeps them too — the path the viewport takes when a turn ends', () => {
        const { mounts, updates, destroy } = recording();
        const b = bubble([call('t1'), text('x1', 'Looking…')]) as Bubble & { updateMessage: (u: { segments: AparteSegment[] }) => void };
        const host = b.querySelector('.aparte-tool-ui');
        b.updateMessage({ segments: [call('t1', { status: 'resolved', result: 'Cloudy' }), text('x1', 'It is cloudy.')] });
        expect(mounts).toHaveLength(1);
        expect(destroy).not.toHaveBeenCalled();
        expect(updates.map((u) => u.status)).toEqual(['resolved']);
        expect(b.querySelector('.aparte-tool-ui')).toBe(host);
        expect(b.querySelector('[data-segment-id="x1"]')?.textContent).toContain('It is cloudy.');
    });

    it('still draws everything again when the segments are not the same ones', () => {
        const { mounts, destroy } = recording();
        const b = bubble([call('t1')]);
        b.setSegments([call('t2')]);
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(mounts).toHaveLength(2);
        expect(b.getSegments().map((s) => s.id)).toEqual(['t2']);
    });

    it('still draws everything again when no card is mounted', () => {
        const b = bubble([text('x1', 'one')]);
        const before = b.querySelector('[data-segment-id="x1"]');
        b.setSegments([text('x1', 'two')]);
        expect(b.querySelector('[data-segment-id="x1"]')).not.toBe(before);
        expect(b.querySelector('[data-segment-id="x1"]')?.textContent).toContain('two');
    });
});
