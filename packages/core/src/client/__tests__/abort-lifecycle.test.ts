import { describe, it, expect, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';

/**
 * Pressing Stop is a deliberate user action, not a failure.
 *
 * The regression this guards: the loop parks on `await reader.read()`, and the
 * abort check sat BEFORE that await — so an abort arriving while parked (the
 * only case that matters, since that is when the user is watching text stream)
 * was never re-evaluated. The provider's catch turned the AbortError into an
 * `{type:'error'}` event, the error branch threw, and the lifecycle handler
 * replaced `segments` wholesale — erasing the answer the user was reading and
 * blaming a fault that never happened.
 */

/** A target element that records what the client asks it to render. */
function makeRecorder(): { el: HTMLElement; calls: { m: string; args: unknown[] }[] } {
    const el = document.createElement('div');
    const calls: { m: string; args: unknown[] }[] = [];
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (el as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => { calls.push({ m, args }); };
    }
    return { el, calls };
}

/**
 * A transport that streams one text delta, then waits to be released before
 * emitting whatever the provider would emit once the fetch is aborted.
 */
function makeConfig(afterAbort: () => Promise<unknown[]>, gate: Promise<void>): AparteConfig {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    cfg.setTransport({
        chat: () => new ReadableStream({
            async start(controller) {
                controller.enqueue({ type: 'text', delta: 'Partial answer so far' });
                await gate;
                for (const e of await afterAbort()) controller.enqueue(e);
                controller.close();
            },
        }),
    } as never);
    return cfg;
}

async function runAbortedTurn(afterAbort: () => Promise<unknown[]>) {
    let release: () => void = () => {};
    const gate = new Promise<void>(r => { release = r; });
    const cfg = makeConfig(afterAbort, gate);
    const rec = makeRecorder();
    const events: string[] = [];
    for (const n of ['aparte-message-aborted', 'aparte-message-error', 'aparte-message-done']) {
        rec.el.addEventListener(n, () => events.push(n));
    }

    const client = new AparteClient({ config: cfg, autoRegister: false });
    const turn = (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
        ._streamTurn(rec.el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');

    // Wait for the delta to have RENDERED, not for 20ms — a duration is a hope,
    // a condition is a fact.
    await vi.waitFor(() => expect(rec.calls.some(c => c.m === 'addSegment')).toBe(true));
    client.abort();                               // the user presses Stop
    release();
    await turn;

    return { calls: rec.calls, events };
}

describe('AparteClient — pressing Stop mid-stream', () => {
    // openai-compat turns the AbortError into an `error` event; ai-sdk stays quiet.
    // Both shapes must leave the user's partial answer on screen.
    for (const [name, afterAbort] of [
        ['when the provider reports the abort as an error event', async () => [{ type: 'error', message: 'The user aborted a request.' }]],
        ['when the provider ends quietly', async () => []],
    ] as const) {
        it(`keeps the streamed answer ${name}`, async () => {
            const { calls } = await runAbortedTurn(afterAbort);

            const rendered = calls.find(c => c.m === 'addSegment');
            expect(rendered, 'the partial answer should have been rendered').toBeDefined();

            const wiped = calls.find(c =>
                c.m === 'updateMessage'
                && (c.args[1] as { segments?: unknown[] } | undefined)?.segments !== undefined,
            );
            expect(
                wiped,
                `aborting replaced the message segments — the streamed answer was erased: ${JSON.stringify(wiped?.args)}`,
            ).toBeUndefined();
        });

        it(`reports an abort, not a failure, ${name}`, async () => {
            const { events } = await runAbortedTurn(afterAbort);
            expect(events).toContain('aparte-message-aborted');
            expect(events).not.toContain('aparte-message-error');
        });
    }
});

describe('AparteClient — Stop during the pre-flight window', () => {
    /**
     * Between accepting a send and opening the stream, the client resolves auth
     * and reads attachments. `_streamController` does not exist yet, so `abort()`
     * has nothing to cancel and the flag is the only trace of the user's intent.
     * `_streamTurn` used to clear that flag unconditionally, so a Stop pressed
     * while a large file was being read was simply forgotten and the request went
     * out anyway.
     */
    it('does not open a stream for a turn the user already stopped', async () => {
        const chat = vi.fn(() => new ReadableStream({ start(c) { c.close(); } }));
        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        cfg.setTransport({ chat } as never);

        const rec = makeRecorder();
        const events: string[] = [];
        rec.el.addEventListener('aparte-message-aborted', () => events.push('aborted'));
        rec.el.addEventListener('aparte-message-start', () => events.push('start'));

        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.abort();  // the user stopped while auth / FileReader was still running

        await (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
            ._streamTurn(rec.el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');

        expect(chat, 'the request went out despite the user stopping').not.toHaveBeenCalled();
        expect(events).toEqual(['aborted']);
    });
});


describe('AparteClient — Stop before the first event arrives', () => {
    /**
     * The third abort path, found by the browser suite after the other two were
     * closed. When the user stops while the request is still in flight, the fetch
     * rejection escapes `transportCall` as an EXCEPTION — it never enters the event
     * stream, so neither the guard around `reader.read()` nor the one on the
     * `error` event can see it, and the turn was rendered as a failure.
     */
    it('renders no error bubble when the transport rejects because we aborted', async () => {
        let rejectNow: (e: Error) => void = () => {};
        const inFlight = new Promise<never>((_, rej) => {
            rejectNow = (e) => rej(e);
        });

        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        cfg.setTransport({ chat: () => inFlight } as never);

        const rec = makeRecorder();
        const events: string[] = [];
        for (const n of ['aparte-message-aborted', 'aparte-message-error']) {
            rec.el.addEventListener(n, () => events.push(n));
        }

        const client = new AparteClient({ config: cfg, autoRegister: false });
        const turn = (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
            ._streamTurn(rec.el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');

        // The turn has started once the streaming status was written; that is the
        // observable moment, and it is what the abort has to land after.
        await vi.waitFor(() => expect(rec.calls.length).toBeGreaterThan(0));
        client.abort();
        rejectNow(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }));
        await turn;

        const errorSegment = rec.calls.find(c =>
            c.m === 'updateMessage'
            && (c.args[1] as { status?: string } | undefined)?.status === 'error',
        );
        expect(errorSegment, 'a deliberate stop was rendered as a failure').toBeUndefined();
        expect(events).toEqual(['aparte-message-aborted']);
    });

    it('still reports a genuine transport failure as an error', async () => {
        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        cfg.setTransport({ chat: () => Promise.reject(new Error('socket hang up')) } as never);

        const rec = makeRecorder();
        const events: string[] = [];
        for (const n of ['aparte-message-aborted', 'aparte-message-error']) {
            rec.el.addEventListener(n, () => events.push(n));
        }

        const client = new AparteClient({ config: cfg, autoRegister: false });
        await (client as unknown as { _streamTurn: (...a: unknown[]) => Promise<void> })
            ._streamTurn(rec.el, 'assistant-1', cfg.getAIProvider('mock'), [{ role: 'user', content: 'hi' }], 'm', 'k');

        expect(events).toEqual(['aparte-message-error']);
    });
});

describe('nothing keeps generating after the page stops caring', () => {
    const harness = () => {
        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        const signals: AbortSignal[] = [];
        cfg.setTransport({
            chat: (_p: unknown, _r: unknown, _a: unknown, ctx: { signal?: AbortSignal }) => {
                if (ctx?.signal) signals.push(ctx.signal);
                // Never resolves on its own: the only way out is an abort.
                return new Promise<never>(() => {});
            },
        } as never);
        const el = document.createElement('div');
        for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'setUsage', 'updateLastMessage', 'appendMessage']) {
            (el as unknown as Record<string, unknown>)[m] = () => {};
        }
        (el as unknown as Record<string, unknown>).getMessages = () => [];
        return { cfg, el, signals };
    };

    const send = (client: unknown, el: HTMLElement, text: string): Promise<void> =>
        (client as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content: text } }),
        ) as Promise<void>;

    it('stop() aborts the stream in flight, not just the listeners', async () => {
        const { cfg, el, signals } = harness();
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never } as never);
        void send(client, el, 'go');
        await new Promise((r) => setTimeout(r, 0));
        expect(signals.length, 'the transport was never called').toBe(1);

        // Both wrappers call stop() on teardown. It used to only remove listeners,
        // so unmounting mid-stream left the vendor request generating and billing.
        (client as unknown as { stop: () => void }).stop();
        expect(signals[0]!.aborted, 'the stream survived the teardown').toBe(true);
    });

    it('a second turn cuts the first, so the abandoned one cannot keep billing', async () => {
        const { cfg, el, signals } = harness();
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never } as never);
        void send(client, el, 'first');
        await new Promise((r) => setTimeout(r, 0));
        void send(client, el, 'second');
        await new Promise((r) => setTimeout(r, 0));

        expect(signals.length, 'two turns should have reached the transport').toBe(2);
        expect(signals[0]!.aborted, 'the first turn was left unabortable').toBe(true);
        expect(signals[1]!.aborted, 'the second turn must still be live').toBe(false);
    });
});
