// @vitest-environment jsdom
/**
 * A segment's identity and measurement, proven on BOTH owners.
 *
 * There are exactly two places a segment can enter a transcript:
 * `<aparte-chat-viewport>` (native mode, the documented vanilla quick start) and
 * `AparteChatHost` (framework-managed mode, what all four wrappers use). Two
 * owners of one invariant is the exact shape of the forgotten-sibling bug this
 * repo has now found five times — a path on N is fixed and its siblings are not.
 *
 * So this suite is table-driven over both, and every assertion runs twice. Wiring
 * the helper into one owner and not the other passes each owner's own test file
 * and fails here, which is the whole point.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../components/viewport/aparte-chat-viewport.js';
import '../components/bubble/aparte-chat-bubble.js';
import { AparteChatHost, type AparteChatHostBinding } from '../host/aparte-chat-host.js';
import type { AparteMessage, AparteSegment, AparteToolCallSegment } from '../types/index.js';

const text = (id: string, extra: Partial<AparteSegment> = {}): AparteSegment =>
    ({ id, type: 'text', content: '', ...extra }) as AparteSegment;

const tool = (id: string): AparteToolCallSegment =>
    ({
        id,
        type: 'tool_call',
        toolCall: { id: `call-${id}`, name: 'search', input: {} },
        status: 'pending',
    }) as AparteToolCallSegment;

/** The slice of an owner this suite exercises — identical on both. */
interface Owner {
    /** Start a fresh assistant message and return its id. */
    newMessage(): string;
    addSegment(segment: AparteSegment): void;
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void;
    removeSegment(segmentId: string): void;
    /** Report the turn finished — the path both agent loops actually take. */
    completeTurn(): void;
    segments(): AparteSegment[];
    /** What the BUBBLE was handed — the second view of the same segment. */
    bubbleSegments(): AparteSegment[];
    teardown(): void;
}

function makeViewportOwner(): Owner {
    const vp = document.createElement('aparte-chat-viewport');
    document.body.appendChild(vp);
    const api = vp as unknown as {
        appendMessage(m: AparteMessage): void;
        addSegment(messageId: string, segment: AparteSegment): void;
        updateSegment(messageId: string, segmentId: string, updates: Partial<AparteSegment>): void;
        removeSegment(messageId: string, segmentId: string): void;
        updateMessage(messageId: string, updates: Partial<AparteMessage>): void;
        getMessages(): AparteMessage[];
    };
    let current = '';
    let n = 0;
    return {
        newMessage() {
            current = `vp-m${++n}`;
            api.appendMessage({ id: current, role: 'assistant', content: '', timestamp: 1 });
            return current;
        },
        addSegment: (s) => api.addSegment(current, s),
        updateSegment: (id, u) => api.updateSegment(current, id, u),
        removeSegment: (id) => api.removeSegment(current, id),
        completeTurn: () => api.updateMessage(current, { status: 'completed' }),
        segments: () => api.getMessages().find((m) => m.id === current)?.segments ?? [],
        bubbleSegments() {
            const bubble = vp.querySelector(`aparte-chat-bubble[message-id="${current}"]`) as
                unknown as { getSegments?: () => AparteSegment[] } | null;
            return bubble?.getSegments?.() ?? [];
        },
        teardown: () => vp.remove(),
    };
}

function makeHostOwner(): Owner {
    const host = document.createElement('aparte-chat');
    const viewport = document.createElement('aparte-chat-viewport');
    host.appendChild(viewport);
    document.body.appendChild(host);
    // The host writes to the bubble FIRST and to the list second; both writes are
    // recorded here so a stamp applied to only one of them is visible.
    Object.assign(viewport, {
        setFrameworkManagedDOM: vi.fn(),
        appendMessage: vi.fn(),
        updateMessage: vi.fn(),
        appendToken: vi.fn(),
        appendToSegment: vi.fn(),
        completeMessage: vi.fn(),
        configure: vi.fn(),
        setAutoScroll: vi.fn(),
    });

    let messages: AparteMessage[] = [];
    const bubbleState = new Map<string, AparteSegment[]>();
    function renderBubbles(): void {
        for (const m of messages) {
            if (viewport.querySelector(`aparte-chat-bubble[message-id="${m.id}"]`)) continue;
            // A real `aparte-chat-bubble`, because `_lastBubble()` queries by tag
            // name; the fakes below shadow the prototype methods on the instance.
            const el = document.createElement('aparte-chat-bubble');
            el.setAttribute('message-id', m.id);
            bubbleState.set(m.id, []);
            Object.assign(el, {
                getSegments: () => bubbleState.get(m.id) ?? [],
                setSegments: vi.fn(),
                setContent: vi.fn(),
                setAttachments: vi.fn(),
                setSiblings: vi.fn(),
                setUsage: vi.fn(),
                updateMessage: vi.fn(),
                addSegment: (s: AparteSegment) =>
                    bubbleState.set(m.id, [...(bubbleState.get(m.id) ?? []), s]),
                updateSegment: (id: string, u: Partial<AparteSegment>) =>
                    bubbleState.set(
                        m.id,
                        (bubbleState.get(m.id) ?? []).map((s) =>
                            s.id === id ? ({ ...s, ...u } as AparteSegment) : s,
                        ),
                    ),
                removeSegment: (id: string) =>
                    bubbleState.set(
                        m.id,
                        (bubbleState.get(m.id) ?? []).filter((s) => s.id !== id),
                    ),
            });
            viewport.appendChild(el);
        }
    }

    const binding: AparteChatHostBinding = {
        hostId: 'host-1',
        host,
        get viewport() { return viewport; },
        getMessages: () => messages,
        setMessages: (m) => { messages = m; renderBubbles(); },
        afterRender: (cb) => cb(),
        resetComposer: vi.fn(),
    };
    const ctl = new AparteChatHost(binding, {});
    const stop = ctl.bind();

    let n = 0;
    let current = '';
    return {
        newMessage() {
            current = `host-m${++n}`;
            messages = [...messages, { id: current, role: 'assistant', content: '', timestamp: 1 }];
            renderBubbles();
            return current;
        },
        addSegment: (s) => ctl.addSegment(s),
        updateSegment: (id, u) => ctl.updateSegment(id, u),
        removeSegment: (id) => ctl.removeSegment(id),
        completeTurn: () => ctl.updateMessage(current, { status: 'completed' }),
        segments: () => messages.find((m) => m.id === current)?.segments ?? [],
        bubbleSegments: () => bubbleState.get(current) ?? [],
        teardown: () => { stop(); host.remove(); },
    };
}

const OWNERS: Array<[string, () => Owner]> = [
    ['aparte-chat-viewport (native)', makeViewportOwner],
    ['AparteChatHost (framework-managed)', makeHostOwner],
];

describe.each(OWNERS)('segment identity — %s', (_name, makeOwner) => {
    let owner: Owner;

    beforeEach(() => {
        owner = makeOwner();
    });

    afterEach(() => {
        owner.teardown();
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    it('stamps the message id on every segment it accepts', () => {
        const messageId = owner.newMessage();
        owner.addSegment(text('a'));
        owner.addSegment(text('b'));

        expect(owner.segments().map((s) => s.messageId)).toEqual([messageId, messageId]);
    });

    it('numbers segments in insertion order', () => {
        owner.newMessage();
        owner.addSegment(text('a'));
        owner.addSegment(text('b'));
        owner.addSegment(text('c'));

        expect(owner.segments().map((s) => s.index)).toEqual([0, 1, 2]);
    });

    it('hands the bubble the same stamped segment it stores', () => {
        // The two views are written at different moments (the host paints first,
        // the viewport stores first). A stamp applied to one and not the other is
        // the failure this asserts against.
        owner.newMessage();
        owner.addSegment(text('a'));

        const stored = owner.segments()[0]!;
        const painted = owner.bubbleSegments().at(-1)!;
        expect(painted.messageId).toBe(stored.messageId);
        expect(painted.index).toBe(stored.index);
        expect(painted.startedAt).toBe(stored.startedAt);
    });

    it('records a start but no end while the segment is open', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        owner.newMessage();
        owner.addSegment(text('a', { isStreaming: true }));

        expect(owner.segments()[0]!.startedAt).toBe(1_000);
        expect(owner.segments()[0]!.endedAt).toBeUndefined();
    });

    it('records the end when streaming stops', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        owner.newMessage();
        owner.addSegment(text('a', { isStreaming: true }));

        vi.setSystemTime(9_000);
        owner.updateSegment('a', { isStreaming: false });

        const settled = owner.segments()[0]!;
        expect(settled.endedAt).toBe(9_000);
        expect(settled.endedAt! - settled.startedAt!).toBe(8_000);
    });

    it('records the end when a tool call leaves pending — the duration nobody could measure', () => {
        vi.useFakeTimers();
        vi.setSystemTime(2_000);
        owner.newMessage();
        owner.addSegment(tool('t1'));

        vi.setSystemTime(5_500);
        owner.updateSegment('t1', { status: 'resolved' } as Partial<AparteSegment>);

        const settled = owner.segments()[0]!;
        expect(settled.endedAt! - settled.startedAt!).toBe(3_500);
    });

    it('does not move an end that is already recorded', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        owner.newMessage();
        owner.addSegment(text('a', { isStreaming: true }));
        vi.setSystemTime(4_000);
        owner.updateSegment('a', { isStreaming: false });

        vi.setSystemTime(60_000);
        owner.updateSegment('a', { meta: { tokens: 12 } } as Partial<AparteSegment>);

        expect(owner.segments()[0]!.endedAt).toBe(4_000);
        expect(owner.segments()[0]!.meta).toEqual({ tokens: 12 });
    });

    it('closes the gap a removal leaves', () => {
        owner.newMessage();
        owner.addSegment(text('a'));
        owner.addSegment(text('b'));
        owner.addSegment(text('c'));

        owner.removeSegment('b');

        expect(owner.segments().map((s) => s.id)).toEqual(['a', 'c']);
        expect(owner.segments().map((s) => s.index)).toEqual([0, 1]);
    });

    it('keeps the numbers a rehydrated segment was persisted with', () => {
        owner.newMessage();
        owner.addSegment(text('stored', { messageId: 'm-from-storage', index: 4, startedAt: 111 }));

        const s = owner.segments()[0]!;
        expect(s.messageId).toBe('m-from-storage');
        expect(s.index).toBe(4);
        expect(s.startedAt).toBe(111);
    });

    // Nothing in a stream says "this thinking block is over": the parser closes its
    // active segment silently and both agent loops report the end on the MESSAGE.
    // So this is where `endedAt` comes from for every segment that is not a tool
    // call — and it was missing entirely until a browser run showed a settled
    // reasoning block with no end.
    it('closes its open segments when the turn is reported finished', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        owner.newMessage();
        owner.addSegment(text('a', { isStreaming: true }));
        owner.addSegment(text('b', { isStreaming: true }));

        expect(owner.segments().every((s) => s.endedAt === undefined)).toBe(true);

        vi.setSystemTime(3_000);
        owner.completeTurn();

        expect(owner.segments().map((s) => s.endedAt)).toEqual([3_000, 3_000]);
        expect(owner.segments().every((s) => s.isStreaming === false)).toBe(true);
    });

    it('does not move an end when the turn is reported finished twice', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        owner.newMessage();
        owner.addSegment(text('a', { isStreaming: true }));
        vi.setSystemTime(2_000);
        owner.completeTurn();

        vi.setSystemTime(30_000);
        owner.completeTurn();

        expect(owner.segments()[0]!.endedAt).toBe(2_000);
    });
});
