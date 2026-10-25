import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../../components/bubble/aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../config/index.js';
import {
    defineMountedToolRenderer,
    getSegmentRenderer,
    overrideSegmentRenderer,
    registerDefaultRenderers,
    toToolCallView,
} from '../index.js';
import type { AparteToolCallSegment, AparteToolCallView, AparteToolRenderer } from '../../types/index.js';

type Bubble = HTMLElement & {
    addSegment: (s: unknown) => void;
    updateSegment: (id: string, u: unknown) => void;
    removeSegment: (id: string) => void;
};

const call = (id: string, name: string, extra: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id, type: 'tool_call', status: 'pending', toolCall: { id: `call-${id}`, name, input: { city: 'Paris' } }, ...extra,
} as AparteToolCallSegment);

function bubble(): Bubble {
    const b = document.createElement('aparte-chat-bubble') as Bubble;
    document.body.appendChild(b);
    return b;
}

/** A mount that records what it was asked, the way a framework wrapper's mount would. */
function recordingMount() {
    const mounts: HTMLElement[] = [];
    const updates: AparteToolCallView[] = [];
    const destroy = vi.fn();
    const renderer = defineMountedToolRenderer((host, view) => {
        mounts.push(host);
        host.textContent = `${view.name}:${view.status}`;
        return {
            update: (next) => { updates.push(next); host.textContent = `${next.name}:${next.status}`; },
            destroy,
        };
    });
    return { renderer, mounts, updates, destroy };
}

describe('defineMountedToolRenderer', () => {
    beforeEach(() => { registerDefaultRenderers(); });
    afterEach(() => {
        aparteGlobalConfig.unregisterToolRenderer('get_weather');
        document.body.replaceChildren();
    });

    it('mounts once and forwards each update to the same mount', () => {
        const { renderer, mounts, updates } = recordingMount();
        aparteGlobalConfig.registerToolRenderer('get_weather', renderer);
        const b = bubble();
        b.addSegment(call('s1', 'get_weather'));
        b.updateSegment('s1', { status: 'resolved', result: '18°C' });
        expect(mounts).toHaveLength(1);
        expect(updates.map((u) => [u.status, u.result])).toEqual([['resolved', '18°C']]);
        expect(b.querySelector('.aparte-tool-ui')?.textContent).toBe('get_weather:resolved');
        expect(b.querySelector('.aparte-tool-ui')).toBe(mounts[0]);
    });

    it('destroys on cleanup', () => {
        const { renderer, destroy } = recordingMount();
        aparteGlobalConfig.registerToolRenderer('get_weather', renderer);
        const b = bubble();
        b.addSegment(call('s1', 'get_weather'));
        b.removeSegment('s1');
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('toToolCallView carries input, result, structuredResult, status, deferred, refusal and abortCause', () => {
        const seg = call('s1', 'get_weather', {
            status: 'rejected',
            result: 'no',
            structuredResult: { t: 18 },
            deferred: { reason: 'approval' },
            refusal: { by: 'person', instruction: 'not now' } as AparteToolCallSegment['refusal'],
        });
        const view = toToolCallView<{ city: string }, { t: number }>(seg);
        expect(view).toMatchObject({
            id: 'call-s1', name: 'get_weather', input: { city: 'Paris' }, status: 'rejected', result: 'no',
            structuredResult: { t: 18 }, deferred: { reason: 'approval' }, refusal: { by: 'person', instruction: 'not now' },
        });
        expect(view.segment).toBe(seg);
    });
});

describe('override stacks', () => {
    beforeEach(() => { registerDefaultRenderers(); });
    afterEach(() => { aparteGlobalConfig.unregisterToolRenderer('get_weather'); });

    const named = (label: string): AparteToolRenderer => ({ render: () => `<div data-by="${label}"></div>` });

    it('a tool override restores what was there, and restoring the lower one keeps the upper one', () => {
        const base = named('base');
        aparteGlobalConfig.registerToolRenderer('get_weather', base);
        const a = named('a');
        const b = named('b');
        const restoreA = aparteGlobalConfig.overrideToolRenderer('get_weather', a);
        const restoreB = aparteGlobalConfig.overrideToolRenderer('get_weather', b);
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(b);
        restoreA();
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(b);
        restoreB();
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(base);
        restoreB();   // twice is harmless
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBe(base);
    });

    it('the last tool override leaves nothing when nothing was registered before', () => {
        const restore = aparteGlobalConfig.overrideToolRenderer('get_weather', named('a'));
        restore();
        expect(aparteGlobalConfig.getToolRenderer('get_weather')).toBeUndefined();
    });

    it('overriding a built-in segment type and restoring brings the built-in back', () => {
        const builtIn = getSegmentRenderer('code');
        expect(builtIn).toBeDefined();
        const restore = overrideSegmentRenderer({ type: 'code', render: () => '<pre data-mine></pre>' });
        expect(getSegmentRenderer('code')).not.toBe(builtIn);
        restore();
        expect(getSegmentRenderer('code')).toBe(builtIn);
    });
});
