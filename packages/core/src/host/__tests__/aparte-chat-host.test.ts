// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

/** A text segment shaped just enough for the host's logic + reconciliation. */
function seg(id: string, content = ''): AparteSegment {
    return { id, type: 'text', content } as unknown as AparteSegment;
}
function msg(id: string, role: AparteMessage['role'], extra: Partial<AparteMessage> = {}): AparteMessage {
    return { id, role, timestamp: 1, ...extra };
}

/** A mock `<aparte-chat-bubble>` exposing the imperative surface the host calls. */
function makeBubble(id: string): HTMLElement {
    const el = document.createElement('aparte-chat-bubble');
    el.setAttribute('message-id', id);
    const state = { segments: [] as AparteSegment[] };
    Object.assign(el, {
        getSegments: () => state.segments,
        setSegments: vi.fn((s: AparteSegment[]) => { state.segments = s; }),
        updateSegment: vi.fn(),
        setContent: vi.fn(),
        setAttachments: vi.fn(),
        setSiblings: vi.fn(),
        setUsage: vi.fn(),
        addSegment: vi.fn((s: AparteSegment) => { state.segments = [...state.segments, s]; }),
        removeSegment: vi.fn(),
        updateMessage: vi.fn(),
    });
    return el;
}

/** Build a host + fake framework binding over a plain message array. */
function makeHarness() {
    const host = document.createElement('aparte-chat');
    const viewport = document.createElement('aparte-chat-viewport');
    host.appendChild(viewport);
    document.body.appendChild(host);

    const vpApi = {
        appendToken: vi.fn(),
        appendToSegment: vi.fn(),
        completeMessage: vi.fn(),
        addBranch: vi.fn(() => 1),
        addSiblingOf: vi.fn(() => 'sib-id'),
        truncateFrom: vi.fn(),
        truncateResponsesAfter: vi.fn(),
        getMessage: vi.fn(() => undefined),
        appendMessage: vi.fn(),
        updateMessage: vi.fn(),
        exportTree: vi.fn(() => ({}) as never),
        importTree: vi.fn(),
        clearAll: vi.fn(),
        resetSpacer: vi.fn(),
        configure: vi.fn(),
        setAutoScroll: vi.fn(),
        setFrameworkManagedDOM: vi.fn(),
        requestSmoothScroll: vi.fn(),
    };
    Object.assign(viewport, vpApi);

    let messages: AparteMessage[] = [];
    function renderBubbles() {
        const have = new Map<string, Element>();
        viewport.querySelectorAll('aparte-chat-bubble').forEach((b) => {
            have.set(b.getAttribute('message-id') ?? '', b);
        });
        const want = new Set(messages.map((m) => m.id));
        for (const [id, el] of have) if (!want.has(id)) el.remove();
        for (const m of messages) if (!have.has(m.id)) viewport.appendChild(makeBubble(m.id));
    }

    const emitted = {
        change: [] as AparteMessage[][],
        appended: [] as AparteMessage[],
        typing: [] as boolean[],
        streaming: [] as Array<string | null>,
    };

    const binding: AparteChatHostBinding = {
        hostId: 'host-1',
        host,
        get viewport() { return viewport; },
        getMessages: () => messages,
        setMessages: (m) => { messages = m; renderBubbles(); },
        onMessagesChange: (m) => emitted.change.push(m),
        onMessageAppended: (m) => emitted.appended.push(m),
        onTypingChange: (t) => emitted.typing.push(t),
        onStreamingChange: (s) => emitted.streaming.push(s),
        afterRender: (cb) => cb(),
        resetComposer: vi.fn(),
    };

    const ctl = new AparteChatHost(binding, {});
    const teardown = ctl.bind();
    const bubbleFor = (id: string) =>
        viewport.querySelector(`aparte-chat-bubble[message-id="${id}"]`) as unknown as Record<string, ReturnType<typeof vi.fn>>;

    return { host, viewport, vpApi, binding, ctl, teardown, emitted, bubbleFor, getMessages: () => messages };
}

describe('AparteChatHost', () => {
    it('installs the imperative method surface on the host element + flags framework-managed DOM', () => {
        const h = makeHarness();
        for (const m of [
            'appendMessage', 'updateMessage', 'updateLastMessage', 'addSegment', 'updateSegment',
            'removeSegment', 'appendToSegment', 'getMessages', 'addBranch', 'addSiblingOf',
            'truncateFrom', 'truncateResponsesAfter', 'clearAll',
        ]) {
            expect(typeof (h.host as unknown as Record<string, unknown>)[m]).toBe('function');
        }
        expect(h.vpApi.setFrameworkManagedDOM).toHaveBeenCalledWith(true);
    });

    it('clearAll on the host element empties the framework state and the viewport — what a compaction resolves by id', () => {
        const h = makeHarness();
        const host = h.host as unknown as { appendMessage: (m: AparteMessage) => void; clearAll: () => void };
        host.appendMessage(msg('u1', 'user', { content: 'first' }));
        expect(h.getMessages()).toHaveLength(1);
        host.clearAll();
        expect(h.getMessages()).toEqual([]);
        expect(h.vpApi.clearAll).toHaveBeenCalled();
    });

    it('clearAll carries its option through to the viewport — a compaction keeps the attachments of the turns it re-appends', () => {
        // The bridge used to be `() => this.clearMessages()`: the argument was dropped, the
        // viewport revoked every object URL, and under every framework wrapper the images
        // on the kept turns came back broken while the plugin's own suite stayed green.
        const h = makeHarness();
        const host = h.host as unknown as { clearAll: (options?: { revokeAttachments?: boolean }) => void };
        host.clearAll({ revokeAttachments: false });
        expect(h.vpApi.clearAll).toHaveBeenCalledWith({ revokeAttachments: false });
        host.clearAll();
        expect(h.vpApi.clearAll).toHaveBeenLastCalledWith(undefined);
    });

    it('appendMessage is optimistic, emits messageAppended, re-enables autoscroll for user msgs', () => {
        const h = makeHarness();
        const u1 = msg('u1', 'user', { content: 'first' });
        h.ctl.appendMessage(u1);
        expect(h.emitted.appended.at(-1)).toBe(u1);
        // appendMessage deliberately does NOT emit onMessagesChange (see the
        // optimistic-append + parent-push race guarded by the Angular spec):
        // echoing the local list to a lagging controlled parent would drop a
        // not-yet-propagated message.
        expect(h.emitted.change.length).toBe(0);
        expect(h.vpApi.setAutoScroll).toHaveBeenCalledWith(true);
        expect(h.getMessages().map((m) => m.id)).toEqual(['u1']);
    });

    it('streams into the last assistant message without touching the prior user message', () => {
        const h = makeHarness();
        h.ctl.appendMessage(msg('u1', 'user', { content: 'first' }));
        h.ctl.appendMessage(msg('a1', 'assistant', { content: '' }));
        h.host.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'a1' } }));
        h.ctl.updateLastMessage('hel', { append: true });
        h.ctl.updateLastMessage('lo', { append: true });
        const msgs = h.getMessages();
        expect(msgs.find((m) => m.id === 'u1')!.content).toBe('first');
        expect(msgs.find((m) => m.id === 'a1')!.content).toBe('hello');
    });

    it('orphan-stream guard: drops late writes when the last message is not the streaming target', () => {
        const h = makeHarness();
        h.ctl.appendMessage(msg('uA', 'user', { content: 'hi' }));
        h.ctl.appendMessage(msg('aA', 'assistant', { content: '' }));
        h.host.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'aA' } }));
        expect(h.ctl.streamingId).toBe('aA');

        // Conversation switch: a different user message becomes the last one.
        h.binding.setMessages([msg('uB', 'user', { content: 'new conv' })]);

        // Orphan tokens/segments from the previous stream must be dropped.
        h.ctl.updateLastMessage('LEAK', { append: true });
        h.ctl.addSegment(seg('s1', 'LEAK'));
        h.ctl.appendToSegment('s1', 'MORE');

        const last = h.getMessages()[0];
        expect(last.content).toBe('new conv');
        expect(last.segments ?? []).toHaveLength(0);
    });

    it('re-populates bubbles + carries usage forward on aparte-path-changed (branch nav)', () => {
        const h = makeHarness();
        h.ctl.appendMessage(msg('m1', 'user', { content: 'q', usage: { tokens: 5 } as never }));

        const detail = {
            messages: [
                msg('m1', 'user', { content: 'q' }), // usage lost in rebuilt path
                msg('m2', 'assistant', { segments: [seg('s', 'ans')] }),
            ],
            siblings: [
                { id: 'm1', count: 1, index: 0 },
                { id: 'm2', count: 2, index: 1 },
            ],
        };
        h.viewport.dispatchEvent(new CustomEvent('aparte-path-changed', { detail }));
        h.ctl.syncBubbles(); // framework's reactive hook

        const msgs = h.getMessages();
        expect(msgs.map((m) => m.id)).toEqual(['m1', 'm2']);
        expect(msgs[0].usage).toEqual({ tokens: 5 }); // carried forward
        expect(h.emitted.change.at(-1)?.map((m) => m.id)).toEqual(['m1', 'm2']);
        expect(h.bubbleFor('m2').setSegments).toHaveBeenCalled();
        expect(h.bubbleFor('m2').setSiblings).toHaveBeenCalledWith(2, 1);
    });

    it('persists usage + clears streaming/typing on aparte-message-done', () => {
        const h = makeHarness();
        h.ctl.appendMessage(msg('a', 'assistant', { content: 'x' }));
        h.host.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'a' } }));
        expect(h.ctl.isStreaming).toBe(true);

        const usage = { tokens: 42, durationMs: 100 } as never;
        h.host.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'a', usage } }));

        expect(h.ctl.isStreaming).toBe(false);
        expect(h.getMessages()[0].usage).toEqual(usage);
        expect(h.bubbleFor('a').setUsage).toHaveBeenCalledWith(usage);
        expect(h.emitted.typing.at(-1)).toBe(false);
    });

    it('streamTokens forwards every token then completes + clears the guard', async () => {
        const h = makeHarness();
        h.ctl.appendMessage(msg('a', 'assistant', { content: '' }));
        async function* gen() { yield 'a'; yield 'b'; yield 'c'; }
        await h.ctl.streamTokens('a', gen());
        expect(h.vpApi.appendToken).toHaveBeenCalledTimes(3);
        expect(h.vpApi.appendToken).toHaveBeenNthCalledWith(3, 'a', 'c');
        expect(h.vpApi.completeMessage).toHaveBeenCalledWith('a');
        expect(h.ctl.streamingId).toBeNull();
    });

    it('stopTokenStream unwinds an IDLE source and runs its cleanup (no zombie subscription)', async () => {
        const h = makeHarness();
        h.ctl.appendMessage(msg('a', 'assistant', { content: '' }));
        let cleanedUp = false;
        // A source that emits one token then idles forever on next() — models the
        // Angular Observable adapter parked on a pending next() with no emission.
        const idle: AsyncIterable<string> = {
            [Symbol.asyncIterator]() {
                let sent = false;
                return {
                    next() {
                        if (!sent) { sent = true; return Promise.resolve({ value: 't', done: false }); }
                        return new Promise<IteratorResult<string>>(() => { /* never resolves */ });
                    },
                    return() { cleanedUp = true; return Promise.resolve({ value: undefined, done: true }); },
                };
            },
        };
        const done = h.ctl.streamTokens('a', idle);
        await Promise.resolve(); // let the first token flush
        h.ctl.stopTokenStream();
        await done;
        expect(cleanedUp).toBe(true);            // iterator.return() fired → subscription torn down
        expect(h.ctl.streamingId).toBeNull();
        // Stopped IS finished: the viewport has no `aborted` status, and its busy flag
        // (branch arrows, retry, edit) hangs off the message reaching a terminal one.
        // This used to assert the opposite, which is how a stopped stream left the
        // transcript read-only for good.
        expect(h.vpApi.completeMessage).toHaveBeenCalledWith('a');
    });

    it('addBranch / addSiblingOf sync the repo first then forward to the viewport', () => {
        const h = makeHarness();
        h.ctl.appendMessage(msg('m1', 'user', { content: 'q' }));
        expect(h.ctl.addBranch('m1')).toBe(1);
        expect(h.vpApi.appendMessage).toHaveBeenCalled(); // repo sync
        expect(h.vpApi.addBranch).toHaveBeenCalledWith('m1');
        expect(h.ctl.addSiblingOf('m1', msg('m2', 'assistant'))).toBe('sib-id');
    });

    it('teardown unbinds host + viewport listeners', () => {
        const h = makeHarness();
        h.teardown();
        h.host.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'z' } }));
        expect(h.ctl.streamingId).toBeNull();
    });

    // ─── appendToSegment: cost, not just correctness ─────────────────────────
    // Streaming a thinking block or a tool pill goes through appendToSegment, which
    // used to rebuild the whole message list and call setMessages +
    // onMessagesChange on EVERY chunk — one full framework render per token, where
    // the token path (appendToken) writes straight into the bubble. At 60 tok/s on a
    // local model that is unusable, and nothing in the API hints at the difference.
    describe('appendToSegment coalescing', () => {
        function withFakeFrames() {
            const frames: FrameRequestCallback[] = [];
            const raf = vi.spyOn(window, 'requestAnimationFrame')
                .mockImplementation((cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
            return { frames, raf, flush: () => { const due = [...frames]; frames.length = 0; due.forEach((cb) => cb(0)); } };
        }

        function harnessWithSegment() {
            const h = makeHarness();
            h.ctl.appendMessage(msg('m1', 'assistant', { segments: [seg('s1')] }));
            h.emitted.change.length = 0; // ignore the append's own sync
            return h;
        }

        it('pushes every chunk to the bubble but syncs framework state once per frame', () => {
            const frames = withFakeFrames();
            const h = harnessWithSegment();

            h.ctl.appendToSegment('s1', 'a');
            h.ctl.appendToSegment('s1', 'b');
            h.ctl.appendToSegment('s1', 'c');

            // The user sees each chunk immediately: the host pushed all three
            // through the viewport's direct path (which writes into the bubble in
            // place — covered by the viewport's own tests)…
            expect(h.vpApi.appendToSegment).toHaveBeenCalledTimes(3);
            expect(h.vpApi.appendToSegment).toHaveBeenLastCalledWith('m1', 's1', 'c');
            // …while the framework has not been asked to re-render yet.
            expect(h.emitted.change).toHaveLength(0);

            frames.flush();
            expect(h.emitted.change).toHaveLength(1);
            const synced = h.emitted.change[0]?.[0]?.segments?.[0] as { content: string };
            expect(synced.content, 'the coalesced sync carries every chunk').toBe('abc');
            frames.raf.mockRestore();
        });

        it('flushes pending chunks before a structural change, preserving order', () => {
            const frames = withFakeFrames();
            const h = harnessWithSegment();

            h.ctl.appendToSegment('s1', 'partial');
            // A new segment arrives before the frame fired: the buffered text must
            // land first, or the state would show the new segment with a stale one.
            h.ctl.addSegment(seg('s2', 'next'));

            const last = h.emitted.change.at(-1)?.[0]?.segments ?? [];
            expect(last.map((s) => s.id)).toEqual(['s1', 's2']);
            expect((last[0] as { content: string }).content).toBe('partial');
            frames.raf.mockRestore();
        });

        it('leaves the framework state equal to what the bubble received', () => {
            const frames = withFakeFrames();
            const h = harnessWithSegment();

            for (const chunk of ['1', '2', '3', '4']) h.ctl.appendToSegment('s1', chunk);
            frames.flush();

            const stateContent = (h.getMessages()[0]?.segments?.[0] as { content: string }).content;
            expect(stateContent).toBe('1234');
            frames.raf.mockRestore();
        });
    });

    // ─── streamTokens: the state channel was missing entirely ────────────────
    // `injectTokenStream` pushed every token to the viewport and NEVER told the
    // framework, so after a manual stream the React/Vue/Svelte list still held
    // `content: ''` — the DOM and the state disagreed, a re-render from state wiped
    // the reply, and a custom bubble (driven by that state) showed nothing at all.
    // Same coalescing discipline as appendToSegment: per-token DOM, one sync/frame.
    describe('streamTokens state sync', () => {
        function withFakeFrames() {
            const frames: FrameRequestCallback[] = [];
            const raf = vi.spyOn(window, 'requestAnimationFrame')
                .mockImplementation((cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
            return { frames, raf, flush: () => { const due = [...frames]; frames.length = 0; due.forEach((cb) => cb(0)); } };
        }

        /** An async iterable that yields on demand, so the test controls the pacing. */
        function controllable(): { tokens: AsyncIterable<string>; push: (t: string) => Promise<void>; end: () => void } {
            let resolveNext: ((r: IteratorResult<string>) => void) | null = null;
            const queue: IteratorResult<string>[] = [];
            const iterable: AsyncIterable<string> = {
                [Symbol.asyncIterator]: () => ({
                    next: () => new Promise<IteratorResult<string>>((resolve) => {
                        const queued = queue.shift();
                        if (queued) resolve(queued);
                        else resolveNext = resolve;
                    }),
                }),
            };
            const deliver = (r: IteratorResult<string>) => {
                if (resolveNext) { const f = resolveNext; resolveNext = null; f(r); }
                else queue.push(r);
            };
            return {
                tokens: iterable,
                push: async (t) => { deliver({ value: t, done: false }); await Promise.resolve(); await Promise.resolve(); },
                end: () => deliver({ value: undefined as unknown as string, done: true }),
            };
        }

        function harnessStreaming() {
            const h = makeHarness();
            h.ctl.appendMessage(msg('a1', 'assistant', { content: '' }));
            h.emitted.change.length = 0;
            return h;
        }

        it('pushes every token to the viewport but syncs framework state once per frame', async () => {
            const frames = withFakeFrames();
            const h = harnessStreaming();
            const src = controllable();

            const run = h.ctl.streamTokens('a1', src.tokens);
            await src.push('Hel');
            await src.push('lo');
            await src.push(' world');

            expect(h.vpApi.appendToken).toHaveBeenCalledTimes(3);
            expect(h.emitted.change, 'no framework render before the frame fires').toHaveLength(0);

            frames.flush();
            expect(h.emitted.change).toHaveLength(1);
            expect(h.emitted.change[0]?.[0]?.content).toBe('Hello world');

            src.end();
            await run;
            frames.raf.mockRestore();
        });

        it('flushes what was streamed before completing the message', async () => {
            const frames = withFakeFrames();
            const h = harnessStreaming();
            const src = controllable();

            const run = h.ctl.streamTokens('a1', src.tokens);
            await src.push('final answer');
            src.end();
            await run;

            // No frame fired: completion must not lose the tokens, and the state
            // must be written BEFORE the viewport is told the message is done.
            expect(h.getMessages()[0]?.content).toBe('final answer');
            expect(h.vpApi.completeMessage).toHaveBeenCalledWith('a1');
            frames.raf.mockRestore();
        });

        it('keeps what was streamed when the stream is stopped mid-flight', async () => {
            const frames = withFakeFrames();
            const h = harnessStreaming();
            const src = controllable();

            const run = h.ctl.streamTokens('a1', src.tokens);
            await src.push('half a repl');
            h.ctl.stopTokenStream();
            await run;

            expect(h.getMessages()[0]?.content).toBe('half a repl');
            // …and the truncated message is finished, not left streaming (see the
            // idle-source test above for why).
            expect(h.vpApi.completeMessage).toHaveBeenCalledWith('a1');
            frames.raf.mockRestore();
        });

        it('targets the stream\'s message id, not whatever is last', async () => {
            const frames = withFakeFrames();
            const h = harnessStreaming();
            const src = controllable();

            const run = h.ctl.streamTokens('a1', src.tokens);
            await src.push('for a1');
            // A message appended mid-stream flushes first (structural change), so
            // the buffered text can't land on the newcomer.
            h.ctl.appendMessage(msg('u2', 'user', { content: 'interrupting' }));
            src.end();
            await run;

            const msgs = h.getMessages();
            expect(msgs.find((m) => m.id === 'a1')?.content).toBe('for a1');
            expect(msgs.find((m) => m.id === 'u2')?.content).toBe('interrupting');
            frames.raf.mockRestore();
        });
    });
});
