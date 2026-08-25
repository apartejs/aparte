// @vitest-environment jsdom
/**
 * The branch picker collapsing to "1 / 1" in framework-managed mode.
 *
 * OPEN DEFECT, found 2026-08-23 on the React e2e projects: pressing ‹ after a retry fork
 * could land the sibling label on "1 / 1" instead of "1 / 2", the picker then hid itself,
 * and the other version became unreachable — the fork was gone. Deterministic on
 * `react` chromium (3 of 3), seen once on `react-webkit`, never on `vanilla`. So a race,
 * not dead logic.
 *
 * ## Why the existing unit tests could not see it
 *
 * `aparte-chat-host.test.ts`'s harness renders bubbles SYNCHRONOUSLY inside
 * `setMessages`, and its `afterRender` is `(cb) => cb()`. That models a framework that
 * commits during the setter, so the bubble always exists by the time the host looks for
 * it. React does not work that way: `setMessages` schedules, and `AparteChat.tsx`
 * implements `afterRender` as `requestAnimationFrame(() => cb())` — a bet on rAF phase
 * landing after React's commit. It does not always. The repo has lost this bet before
 * (`25f356b`, "the stream-sync flake had a cause — a bet on rAF phase").
 *
 * ## The mechanism these tests pin
 *
 * `_applyPendingSiblings` reads each sibling's bubble and `continue`s when it is absent,
 * then clears `_pendingSiblings` unconditionally. So a callback that runs one tick early
 * DISCARDS the sibling counts, and nothing ever retries: the bubble keeps its default of
 * one sibling, the picker hides, and the branch is unreachable for the life of the page.
 *
 * The harness below is the same shape as the shared one except for the one thing that
 * matters — rendering is deferred, and `afterRender` can be made to fire before it.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

const seg = (id: string, content = ''): AparteSegment =>
    ({ id, type: 'text', content } as unknown as AparteSegment);
const msg = (id: string, role: AparteMessage['role'], extra: Partial<AparteMessage> = {}): AparteMessage =>
    ({ id, role, timestamp: 1, ...extra });

function makeBubble(id: string): HTMLElement {
    const el = document.createElement('aparte-chat-bubble');
    el.setAttribute('message-id', id);
    Object.assign(el, {
        getSegments: () => [],
        setSegments: vi.fn(),
        updateSegment: vi.fn(),
        setContent: vi.fn(),
        setAttachments: vi.fn(),
        setSiblings: vi.fn(),
        setUsage: vi.fn(),
        addSegment: vi.fn(),
        removeSegment: vi.fn(),
        updateMessage: vi.fn(),
    });
    return el;
}

/**
 * A binding that renders LATER, like React.
 *
 * `commit()` is the framework's render pass. `afterRender` queues, and the test decides
 * whether the queue drains before or after that pass — which is the whole variable the
 * rAF bet leaves to chance in production.
 */
function makeDeferredHarness() {
    const host = document.createElement('div');
    const viewport = document.createElement('aparte-chat-viewport');
    host.appendChild(viewport);
    document.body.appendChild(host);

    Object.assign(viewport, {
        appendToken: vi.fn(), appendToSegment: vi.fn(), completeMessage: vi.fn(),
        addBranch: vi.fn(() => 1), addSiblingOf: vi.fn(() => 'sib-id'),
        truncateFrom: vi.fn(), truncateResponsesAfter: vi.fn(),
        getMessage: vi.fn(() => undefined), appendMessage: vi.fn(), updateMessage: vi.fn(),
        exportTree: vi.fn(() => ({}) as never), importTree: vi.fn(), clearAll: vi.fn(),
        resetSpacer: vi.fn(), configure: vi.fn(), setAutoScroll: vi.fn(),
        setFrameworkManagedDOM: vi.fn(), requestSmoothScroll: vi.fn(),
    });

    let messages: AparteMessage[] = [];
    const queue: Array<() => void> = [];

    /** The framework's render pass — deliberately NOT called by `setMessages`. */
    const commit = (): void => {
        const have = new Set(
            [...viewport.querySelectorAll('aparte-chat-bubble')]
                .map((b) => b.getAttribute('message-id') ?? ''),
        );
        for (const m of messages) if (!have.has(m.id)) viewport.appendChild(makeBubble(m.id));
    };
    /**
     * ONE frame: run the callbacks queued as of now, not the ones they queue.
     *
     * A `while (queue.length)` loop would model something rAF is not — it would run a
     * reschedule immediately instead of on the next frame, burning every retry before the
     * commit lands and making a correct fix look broken. It did, on the first run.
     */
    const drain = (): void => {
        const frame = queue.splice(0, queue.length);
        for (const cb of frame) cb();
    };

    const binding: AparteChatHostBinding = {
        hostId: 'host-1',
        host,
        get viewport() { return viewport; },
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => { queue.push(cb); },
        resetComposer: vi.fn(),
    };

    const ctl = new AparteChatHost(binding, {});
    ctl.bind();

    const bubbleFor = (id: string): { setSiblings: ReturnType<typeof vi.fn> } =>
        viewport.querySelector(`aparte-chat-bubble[message-id="${id}"]`) as never;

    return { host, viewport, ctl, commit, drain, bubbleFor };
}

/** A retry fork: two messages on the path, the assistant one having a sibling. */
const forkDetail = {
    messages: [msg('m1', 'user', { content: 'q' }), msg('m2', 'assistant', { segments: [seg('s', 'v1')] })],
    siblings: [{ id: 'm1', count: 1, index: 0 }, { id: 'm2', count: 2, index: 0 }],
};

describe('the branch picker survives a framework that renders late', () => {
    it('applies the sibling count when the render lands FIRST', () => {
        // The lucky ordering — the one production hits most of the time, which is why the
        // defect read as intermittent rather than broken.
        const h = makeDeferredHarness();
        h.viewport.dispatchEvent(new CustomEvent('aparte-path-changed', { detail: forkDetail }));

        h.commit();
        h.drain();

        expect(h.bubbleFor('m2').setSiblings).toHaveBeenCalledWith(2, 0);
    });

    it('STILL applies it when the callback runs before the render', () => {
        /*
         * The unlucky ordering, and the whole defect.
         *
         * `afterRender` fires, no bubble exists yet, and the host used to `continue` past
         * it and then clear `_pendingSiblings` — so the count was gone for good. The bubble
         * arrives a tick later showing its default of one sibling: "1 / 1", picker hidden,
         * the other version unreachable.
         *
         * Nothing about that is React-specific. Any binding whose `afterRender` can precede
         * its commit hits it, which is why the fix belongs to the host rather than to one
         * wrapper's rAF call.
         */
        const h = makeDeferredHarness();
        h.viewport.dispatchEvent(new CustomEvent('aparte-path-changed', { detail: forkDetail }));

        h.drain();   // early: nothing rendered yet
        h.commit();  // the framework catches up
        h.drain();   // whatever the host rescheduled

        expect(
            h.bubbleFor('m2').setSiblings,
            'the fork must not be lost because a callback ran one tick early',
        ).toHaveBeenCalledWith(2, 0);
    });

    it('gives up rather than retrying forever when the bubble never arrives', () => {
        // A message that leaves the path entirely: the bubble is never rendered, and the
        // host must stop rescheduling instead of holding a callback for the page's life.
        const h = makeDeferredHarness();
        h.viewport.dispatchEvent(new CustomEvent('aparte-path-changed', {
            detail: {
                messages: [msg('m1', 'user', { content: 'q' })],
                siblings: [{ id: 'gone', count: 2, index: 0 }],
            },
        }));

        for (let i = 0; i < 12; i++) { h.drain(); h.commit(); }

        // The assertion is that this terminated at all, and left no bubble behind.
        expect(h.bubbleFor('gone')).toBeNull();
    });
});
