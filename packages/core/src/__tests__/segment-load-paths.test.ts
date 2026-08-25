// @vitest-environment jsdom
/**
 * The four ways history arrives, on both owners.
 *
 * Adopting history is not the same act as starting a segment, and until this suite
 * existed the library did not know that. Four entry paths for stored data disagreed:
 * the viewport's `setMessages` stamped and INVENTED a `startedAt`, `importTree` wrote to
 * the repository raw, `addMessage` did nothing, and `AparteChatHost.appendMessage` — the
 * same name as the viewport's method, the opposite behaviour — did nothing either. So the
 * same stored conversation came back with different numbers depending on the mode and on
 * whether a branch tree had been saved. Not one bug: an incoherence.
 *
 * Table-driven on purpose. The defect was two owners of one invariant drifting apart in
 * silence, and the only test shape that catches that is one that cannot be satisfied by
 * fixing a single side.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../components/viewport/aparte-chat-viewport.js';
import '../components/bubble/aparte-chat-bubble.js';
import { AparteChatHost } from '../host/aparte-chat-host.js';
import { segmentTiming, segmentDuration, adoptMessageSegments, openSegmentIds } from '../utils/segments.js';
import type { AparteMessage, AparteSegment } from '../types/index.js';

interface ViewportApi {
    setMessages(m: AparteMessage[]): void;
    addMessage(m: AparteMessage): void;
    importTree(t: { headId: string | null; messages: { message: AparteMessage; parentId: string | null }[] }): void;
    getMessages(): AparteMessage[];
}

const viewport = (): ViewportApi => {
    const el = document.createElement('aparte-chat-viewport');
    document.body.appendChild(el);
    return el as unknown as ViewportApi;
};

type LoadPath = { name: string; load(messages: AparteMessage[]): AparteMessage[] };

const PATHS: LoadPath[] = [
    { name: 'viewport.setMessages', load: (m) => { const a = viewport(); a.setMessages(m); return a.getMessages(); } },
    { name: 'viewport.addMessage', load: (m) => { const a = viewport(); m.forEach((x) => a.addMessage(x)); return a.getMessages(); } },
    {
        name: 'viewport.importTree',
        load: (m) => {
            const a = viewport();
            a.importTree({ headId: m[m.length - 1]!.id, messages: m.map((x) => ({ message: x, parentId: null })) });
            return a.getMessages();
        },
    },
    {
        name: 'AparteChatHost.appendMessage',
        load: (messages) => {
            let list: AparteMessage[] = [];
            const host = document.createElement('div');
            const vp = document.createElement('aparte-chat-viewport');
            host.appendChild(vp);
            document.body.appendChild(host);
            const h = new AparteChatHost({
                hostId: 'load-probe',
                host,
                viewport: vp,
                getMessages: () => list,
                setMessages: (m) => { list = m; },
                afterRender: (cb) => { cb(); },
            });
            h.bind();
            for (const m of messages) h.appendMessage(m, { historical: true });
            return list;
        },
    },
];

/** What a real store holds: no measurement, because no protocol ever gave it one. */
const history = (): AparteMessage[] => [{
    id: 'm-old',
    role: 'assistant',
    content: '',
    timestamp: 1_600_000_000_000,
    segments: [
        { id: 's-think', type: 'thinking', content: 'why' } as AparteSegment,
        { id: 's-text', type: 'text', content: 'because' } as AparteSegment,
    ],
}];

const segmentsOf = (messages: AparteMessage[]): AparteSegment[] =>
    messages.find((m) => m.id === 'm-old')?.segments ?? [];

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe.each(PATHS)('history through $name', (path) => {
    it('never invents a measurement', () => {
        vi.useFakeTimers();
        vi.setSystemTime(9_999_999);

        const segments = segmentsOf(path.load(history()));

        expect(segments).toHaveLength(2);
        for (const s of segments) {
            // The whole point. A span nobody measured is ABSENT — not zero, and not the
            // moment the page happened to load.
            expect(segmentTiming(s)?.startedAt).toBeUndefined();
            expect(segmentDuration(s)).toBeUndefined();
        }
    });

    it('recomputes position and parent instead of trusting them', () => {
        const forged = history();
        forged[0]!.segments = [
            { id: 's-a', type: 'text', content: 'a', index: 41, messageId: 'somewhere-else' } as AparteSegment,
            { id: 's-b', type: 'text', content: 'b', index: 41, messageId: 'somewhere-else' } as AparteSegment,
        ];

        const segments = segmentsOf(path.load(forged));

        // Both claim index 41 and a parent they do not have. These are DERIVABLE facts
        // about the array being joined, so a stored value can only contradict it — and
        // two segments at one index is the failure the whole seam was built for.
        expect(segments.map((s) => s.index)).toEqual([0, 1]);
        expect(segments.every((s) => s.messageId === 'm-old')).toBe(true);
    });

    it('settles what it adopts, so a finished turn is not reopened', () => {
        const streaming = history();
        // Persisted mid-stream — a tab closed on a live turn. Restored as
        // `isStreaming: true` it renders a caret for ever, and stays in
        // `openSegmentIds`, where the next turn-close stamps it a brand-new end.
        // History is finished, whatever the row says.
        streaming[0]!.segments![0] = {
            id: 's-think', type: 'thinking', content: 'why', isStreaming: true,
        } as AparteSegment;

        const segments = segmentsOf(path.load(streaming));

        expect(segments.every((s) => s.isStreaming === false)).toBe(true);
        expect(openSegmentIds(segments)).toEqual([]);
    });

    it('closes a request for a human decision nobody can answer any more', () => {
        const pending = history();
        // A tab closed on a tool call that was waiting for Approve / Reject. The loop
        // that awaited it is gone and the promise it would have settled went with the
        // page, so nothing can answer it — yet `status` survived the round trip
        // untouched, which is a different hole from the `isStreaming` one above:
        // `isSegmentSettled` reads STATUS for a tool_call, so the assertion in the
        // previous test cannot see this case at all.
        pending[0]!.segments![0] = {
            id: 's-gate', type: 'tool_call', status: 'awaiting-approval',
            toolCall: { id: 'c1', name: 'danger', input: {} },
        } as unknown as AparteSegment;

        const segments = segmentsOf(path.load(pending));
        const gate = segments.find((s) => s.id === 's-gate') as { status?: string } | undefined;

        // `'aborted'` and not `'rejected'`: nobody refused it. The same distinction the
        // live gate now makes when a turn is stopped mid-wait.
        expect(gate?.status, 'nobody refused it — the page simply went away').toBe('aborted');
        expect(openSegmentIds(segments), 'and the next turn-close must not stamp it an end').toEqual([]);
    });
});

describe('adoptMessageSegments', () => {
    it('always returns a new object, even with no segments to adopt', () => {
        // Not an optimisation to skip: the owners hand one object to the repository AND
        // to the framework's list, so returning the caller's message makes the immediate
        // paint and the coalesced write land on the same string twice. Writing that
        // shortcut doubled every streamed reply, and the shared-object suite caught it
        // within minutes.
        const message: AparteMessage = { id: 'm', role: 'assistant', content: 'x', timestamp: 1 };

        expect(adoptMessageSegments(message)).not.toBe(message);
        expect(adoptMessageSegments(message)).toEqual(message);
    });
});
