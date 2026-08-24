// @vitest-environment jsdom
/**
 * Per-type segment defaults.
 *
 * The problem: a consumer streaming a reply does not CONSTRUCT its segments — the
 * parser does — so a per-segment field like `collapsed` was unreachable for the one
 * case that matters. And the first shape proposed for this was `setThinkingOpen()`,
 * which needs a sibling function the next time any type wants a default. One call,
 * keyed by type, and the type key is a string so a consumer's own type is covered.
 *
 * Applied where identity is stamped, so all three arrival paths get it for free:
 * `addSegment`, the segments seeded on `appendMessage`, and the framework host.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';
import { registerDefaultRenderers } from '../../renderers/segment-renderers.js';
import { aparteGlobalConfig } from '../../config/aparte-config.js';
import { stampSegmentOnInsert, segmentTiming } from '../segments.js';
import type { AparteSegment } from '../../types/index.js';

registerDefaultRenderers();

interface VP extends HTMLElement {
    appendMessage(m: unknown): void;
    addSegment(messageId: string, s: unknown): void;
    getMessages(): { segments?: AparteSegment[] }[];
}

/** The stored segment — what the defaults actually write. */
const stored = (vp: VP, i = 0): Record<string, unknown> =>
    vp.getMessages()[0]!.segments![i] as unknown as Record<string, unknown>;

const mount = (): VP => {
    const vp = document.createElement('aparte-chat-viewport') as VP;
    document.body.appendChild(vp);
    return vp;
};

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('the helper', () => {
    const seg = { id: 's1', type: 'thinking', content: 'x' } as unknown as AparteSegment;

    it('fills in what the producer did not say', () => {
        const out = stampSegmentOnInsert([], seg, 'm1', { collapsed: false, label: 'Reasoning' });
        expect((out as unknown as Record<string, unknown>).collapsed).toBe(false);
        expect((out as unknown as Record<string, unknown>).label).toBe('Reasoning');
    });

    it('never talks over the producer — including an explicit undefined', () => {
        const withOwn = { ...seg, collapsed: true, label: undefined } as unknown as AparteSegment;
        const out = stampSegmentOnInsert([], withOwn, 'm1', { collapsed: false, label: 'Reasoning' });
        expect((out as unknown as Record<string, unknown>).collapsed).toBe(true);
        // `label: undefined` is a statement, not a gap. `in` is the test, not `??` —
        // a producer that meant "no label" must not get one from a default.
        expect((out as unknown as Record<string, unknown>).label).toBeUndefined();
    });

    it('refuses identity, whatever a default says', () => {
        const out = stampSegmentOnInsert([seg], seg, 'm1', {
            id: 'stolen', type: 'text', messageId: 'elsewhere', index: 99,
        });
        expect(out.id).toBe('s1');
        expect(out.type).toBe('thinking');
        expect(out.messageId).toBe('m1');
        expect(out.index).toBe(1);
    });

    it('and refuses a forged measurement, which is not identity but is core’s', () => {
        // `startedAt`/`endedAt` used to be RESERVED as fields of their own. They live in
        // `meta.aparte` now, so the reserved thing is that sub-object: a default that
        // could inject one would let an app hand itself a span it never measured, which
        // is the same lie the reload path was telling.
        const out = stampSegmentOnInsert([], seg, 'm1', {
            meta: { aparte: { startedAt: 1, endedAt: 2 }, cost: 7 },
        });
        expect(segmentTiming(out)?.startedAt).not.toBe(1);
        expect(segmentTiming(out)?.endedAt).toBeUndefined();
        // The rest of the bag is the app's and passes through untouched.
        expect(out.meta?.cost).toBe(7);
    });
});

describe('through the viewport', () => {
    it('reaches a segment added after the message', () => {
        aparteGlobalConfig.setSegmentDefaults('thinking', { collapsed: false });
        const vp = mount();
        vp.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1 });
        vp.addSegment('m1', { id: 's1', type: 'thinking', content: 'why' });

        expect(stored(vp).collapsed).toBe(false);
    });

    it('and a segment SEEDED on the message — the path the parser feeds', () => {
        aparteGlobalConfig.setSegmentDefaults('thinking', { collapsed: false });
        const vp = mount();
        vp.appendMessage({
            id: 'm1', role: 'assistant', content: '', timestamp: 1,
            segments: [{ id: 's1', type: 'thinking', content: 'why' }],
        });

        expect(stored(vp).collapsed).toBe(false);
    });

    it('does nothing without a default — closed is the shipped behaviour', () => {
        const vp = mount();
        vp.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1 });
        vp.addSegment('m1', { id: 's1', type: 'thinking', content: 'why' });

        // Not `false` — ABSENT. The renderer's rule is `collapsed === false ? open`,
        // so a segment nobody spoke for is closed without anyone writing it down.
        expect('collapsed' in stored(vp)).toBe(false);
    });

    it('works for a type core has never heard of', () => {
        aparteGlobalConfig.setSegmentDefaults('my-chart', { theme: 'dark' });
        const vp = mount();
        vp.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1 });
        vp.addSegment('m1', { id: 's1', type: 'my-chart' });

        const stored = vp.getMessages()[0]!.segments![0] as unknown as Record<string, unknown>;
        expect(stored.theme).toBe('dark');
    });

    it('is baked in at insertion, not read again later', () => {
        aparteGlobalConfig.setSegmentDefaults('thinking', { collapsed: false });
        const vp = mount();
        vp.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1 });
        vp.addSegment('m1', { id: 's1', type: 'thinking', content: 'why' });

        aparteGlobalConfig.clearSegmentDefaults('thinking');

        // Deliberate: a block the reader opened has state the data does not, and a
        // retroactive default would take it away.
        expect(stored(vp).collapsed).toBe(false);
    });
});
