// @vitest-environment jsdom
/**
 * The lifecycle dispatchers, now that there is one copy instead of two.
 *
 * These functions were duplicated — private methods on `AparteClient`, and
 * module-level twins in `stream-adapter.ts`, one per streaming loop. The twins
 * drifted: the adapter's copy did not stamp `targetId`, and `aparte-composer`'s
 * `_isForThisComposer` treats an ABSENT `targetId` as "for me" on purpose, so a
 * single-chat page needs no wiring. On a two-chat page the engine path therefore
 * made stopping chat A reset chat B's composer too.
 *
 * The engine parity suite could not see it. Its recorder element has no `id`, so
 * both paths produced `targetId: undefined` and agreed — the one thing the suite
 * exists to compare was the one thing it normalised away.
 *
 * That is what these tests pin: the stamp, on an element that HAS an id.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { dispatchLifecycleEvent } from '../lifecycle-events.js';

function host(id?: string): HTMLElement {
    const el = document.createElement('div');
    if (id) el.id = id;
    document.body.appendChild(el);
    return el;
}

function record(el: HTMLElement, name: string): unknown[] {
    const seen: unknown[] = [];
    el.addEventListener(name, (e) => seen.push((e as CustomEvent).detail));
    return seen;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('dispatchLifecycleEvent', () => {
    it('stamps the host id, which is the whole point of the function', () => {
        const el = host('chat-a');
        const seen = record(el, 'aparte-message-done');
        dispatchLifecycleEvent(el, 'aparte-message-done', { messageId: 'm1', role: 'assistant' });
        expect(seen).toEqual([{ targetId: 'chat-a', messageId: 'm1', role: 'assistant' }]);
    });

    it('leaves targetId undefined on an id-less host, so a single-chat page still matches', () => {
        // Not an oversight: `_isForThisComposer` reads an absent targetId as "mine".
        const el = host();
        const seen = record(el, 'aparte-message-done');
        dispatchLifecycleEvent(el, 'aparte-message-done', { messageId: 'm1' });
        expect(seen).toEqual([{ targetId: undefined, messageId: 'm1' }]);
    });

    it('does not let a caller override the stamp', () => {
        // The stamp is spread FIRST, so a detail carrying its own targetId wins. That
        // is deliberate — `aparte-composer` dispatches `aparte-abort` with its own
        // targetId — and it is worth pinning, because reversing the spread order
        // would silently retag every event with its host instead.
        const el = host('chat-a');
        const seen = record(el, 'aparte-abort');
        dispatchLifecycleEvent(el, 'aparte-abort', { targetId: 'chat-b' });
        expect(seen).toEqual([{ targetId: 'chat-b' }]);
    });

    it('passes a non-object detail through instead of throwing', () => {
        // This guard came from the adapter copy and is a superset of the client's
        // unconditional spread — which is why unifying on it changed no call site.
        //
        // The observed value is `null`, not `undefined`: `CustomEvent` normalises a
        // missing detail to null per the DOM spec. Worth pinning rather than
        // asserting what you assume — I wrote `undefined` here first and this test
        // is what corrected it.
        const el = host('chat-a');
        const seen = record(el, 'aparte-reset');
        dispatchLifecycleEvent(el, 'aparte-reset', undefined);
        expect(seen).toEqual([null]);
    });

    it('bubbles and composes, or a listener on document never sees it', () => {
        const el = host('chat-a');
        const onDocument = record(document.body, 'aparte-message-start');
        dispatchLifecycleEvent(el, 'aparte-message-start', { messageId: 'm1' });
        expect(onDocument).toHaveLength(1);
    });
});
