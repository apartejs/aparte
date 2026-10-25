import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import { registerDefaultRenderers, registerSegmentRenderer, unregisterSegmentRenderer } from '../../../renderers/index.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteSegmentRenderer } from '../../../types/segments.js';

/**
 * A renderer may mount something in the element it returns — a framework component, a
 * preview, a timer. `cleanup` is the one moment it learns that element is gone for good,
 * and it must come exactly once per element: never for an update or a relabel, never for a
 * bubble a framework only moved, and always for an element a re-render replaced, a segment
 * that was removed, or a bubble that left the page.
 */
type Bubble = HTMLElement & {
    addSegment: (s: unknown) => void;
    setSegments: (s: unknown[]) => void;
    updateSegment: (id: string, u: unknown) => void;
    removeSegment: (id: string) => void;
    aparteConfigChanged: () => void;
};

const log: string[] = [];
const cleanup = vi.fn((el: HTMLElement) => { log.push(`cleanup:${el.dataset['n']}`); });
let drawn = 0;

function probe(overrides: Partial<AparteSegmentRenderer> = {}): AparteSegmentRenderer {
    return {
        type: 'probe',
        render: (segment) => {
            const el = document.createElement('div');
            el.dataset['segmentId'] = segment.id;
            el.dataset['n'] = String(++drawn);
            return el;
        },
        setup: (el) => { log.push(`setup:${el.dataset['n']}`); },
        cleanup,
        ...overrides,
    };
}

function bubble(): Bubble {
    const b = document.createElement('aparte-chat-bubble') as Bubble;
    document.body.appendChild(b);
    return b;
}

const microtask = () => Promise.resolve();

describe('<aparte-chat-bubble> — a renderer is told once when its element leaves', () => {
    beforeEach(() => {
        registerDefaultRenderers();
        registerSegmentRenderer(probe());
        cleanup.mockClear();
        log.length = 0;
        drawn = 0;
    });
    afterEach(() => {
        unregisterSegmentRenderer('probe', aparteGlobalConfig);
        document.body.replaceChildren();
    });

    it('removing a segment tears its element down once', () => {
        const b = bubble();
        b.addSegment({ id: 's1', type: 'probe' });
        b.removeSegment('s1');
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect((cleanup.mock.calls[0]![0] as HTMLElement).dataset['n']).toBe('1');
    });

    it('a re-render tears the old element down before the new one is set up', () => {
        const b = bubble();
        b.addSegment({ id: 's1', type: 'probe' });
        b.setSegments([{ id: 's1', type: 'probe' }]);
        expect(log).toEqual(['setup:1', 'cleanup:1', 'setup:2']);
    });

    it('update and relabel never tear down', () => {
        unregisterSegmentRenderer('probe', aparteGlobalConfig);
        registerSegmentRenderer(probe({ update: () => { /* patch in place */ }, relabel: () => { /* text only */ } }));
        const b = bubble();
        b.addSegment({ id: 's1', type: 'probe', content: 'a' });
        b.updateSegment('s1', { content: 'b' });
        window.dispatchEvent(new CustomEvent('aparte-config-change'));
        expect(cleanup).not.toHaveBeenCalled();
    });

    it('the bubble tears an element down before it replaces it (a renderer with no update)', () => {
        const b = bubble();
        b.addSegment({ id: 's1', type: 'probe', content: 'a' });
        b.updateSegment('s1', { content: 'b' });
        expect(log).toEqual(['setup:1', 'cleanup:1', 'setup:2']);
    });

    it('a renderer that replaces its element in update is still tracked', () => {
        unregisterSegmentRenderer('probe', aparteGlobalConfig);
        registerSegmentRenderer(probe({
            update: (el, segment) => {
                const next = document.createElement('div');
                next.dataset['segmentId'] = segment.id;
                next.dataset['n'] = 'replacement';
                el.replaceWith(next);
            },
        }));
        const b = bubble();
        b.addSegment({ id: 's1', type: 'probe', content: 'a' });
        b.updateSegment('s1', { content: 'b' });
        b.removeSegment('s1');
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect((cleanup.mock.calls[0]![0] as HTMLElement).dataset['n']).toBe('replacement');
    });

    it('a frame redraw releases every segment before it rebuilds', async () => {
        const b = bubble();
        b.addSegment({ id: 's1', type: 'probe' });
        b.addSegment({ id: 's2', type: 'probe' });
        // A frame of the app's own, honouring the shell contract: the root and the segments.
        aparteGlobalConfig.setBubbleShellRenderer(() =>
            '<div class="aparte-message probe-shell"><div class="aparte-message-content"><div class="aparte-segments"></div></div></div>');
        try {
            b.aparteConfigChanged();
            await microtask();
            expect(cleanup).toHaveBeenCalledTimes(2);
            expect(log.filter((l) => l.startsWith('setup:'))).toHaveLength(4);
        } finally {
            aparteGlobalConfig.setBubbleShellRenderer(null);
        }
    });

    it('a bubble moved within the same task is not torn down', async () => {
        const b = bubble();
        b.addSegment({ id: 's1', type: 'probe' });
        const elsewhere = document.createElement('section');
        document.body.appendChild(elsewhere);
        elsewhere.appendChild(b);   // a keyed list moving a row: out and back in, synchronously
        await microtask();
        expect(cleanup).not.toHaveBeenCalled();
    });

    it('a bubble removed for good tears every segment down', async () => {
        const b = bubble();
        b.addSegment({ id: 's1', type: 'probe' });
        b.addSegment({ id: 's2', type: 'probe' });
        b.remove();
        await microtask();
        expect(cleanup).toHaveBeenCalledTimes(2);
    });

    it('a bubble re-attached after a long detach renders its segments again', async () => {
        const b = bubble();
        b.addSegment({ id: 's1', type: 'probe' });
        b.remove();
        await microtask();
        expect(cleanup).toHaveBeenCalledTimes(1);
        document.body.appendChild(b);
        expect(log).toEqual(['setup:1', 'cleanup:1', 'setup:2']);
        b.removeSegment('s1');
        expect(cleanup).toHaveBeenCalledTimes(2);
    });

    it('emptying the transcript unmounts each segment of each bubble once', async () => {
        const list = document.createElement('div');
        document.body.appendChild(list);
        for (const id of ['a', 'b']) {
            const b = document.createElement('aparte-chat-bubble') as Bubble;
            list.appendChild(b);
            b.addSegment({ id, type: 'probe' });
        }
        list.replaceChildren();   // what a conversation switch does to the rows
        await microtask();
        expect(cleanup).toHaveBeenCalledTimes(2);
    });
});
