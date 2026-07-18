import { describe, it, expect, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfigClass } from '../../config/index.js';
import type { AparteStreamRunner } from '../stream-adapter.js';

/**
 * The `streamRunner` seam. Verifies `_streamLoop` delegates to an injected
 * headless runner (a consumer wires @aparte/engine's runStreamAgent) and
 * renders its events through the core adapter, WITHOUT touching the inline loop.
 * The runner↔adapter parity itself is proven in @aparte/engine's stream-parity
 * suite; here we prove the wiring (delegation, option pass-through, transport
 * bridge, prefix segments).
 */

function makeRecorder(): { el: HTMLElement; calls: { m: string; args: unknown[] }[] } {
    const el = document.createElement('div');
    const calls: { m: string; args: unknown[] }[] = [];
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) {
        (el as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => { calls.push({ m, args }); };
    }
    return { el, calls };
}

function makeConfig(transportChat: (...a: unknown[]) => unknown): AparteConfigClass {
    const cfg = new AparteConfigClass();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    cfg.setTransport({ chat: transportChat } as never);
    return cfg;
}

const REQ = { messages: [{ role: 'user', content: 'hi' }], modelId: 'm', stream: true };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runLoop = (client: AparteClient, target: HTMLElement, cfg: AparteConfigClass, req: unknown = REQ) =>
    (client as unknown as { _streamLoop: (t: unknown, id: string, p: unknown, r: unknown, a: unknown) => Promise<unknown> })
        ._streamLoop(target, 'assistant-1', cfg.getAIProvider('mock'), req, 'k');

describe('AparteClient — streamRunner seam', () => {
    it('delegates the loop to the injected runner and renders its events (inline loop untouched)', async () => {
        const transportChat = vi.fn(async () => '');
        const cfg = makeConfig(transportChat);
        const rec = makeRecorder();

        const runner = vi.fn<AparteStreamRunner>(async (opts) => {
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'text-delta', delta: 'Hi' });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done', usage: { inputTokens: 2, outputTokens: 1 } });
            return { inputTokens: 2, outputTokens: 1 };
        });

        const client = new AparteClient({ config: cfg, autoRegister: false, streamRunner: runner });
        const usage = await runLoop(client, rec.el, cfg);

        // Delegated: runner ran; the inline loop never called the transport.
        expect(runner).toHaveBeenCalledOnce();
        expect(transportChat).not.toHaveBeenCalled();

        // Options passed through.
        const opts = runner.mock.calls[0]![0];
        expect(opts.messageId).toBe('assistant-1');
        expect(opts.baseRequest.messages[0]).toEqual({ role: 'user', content: 'hi' });
        expect(typeof opts.transportCall).toBe('function');
        expect(typeof opts.toolLookup).toBe('function');
        expect(opts.signal).toBeInstanceOf(AbortSignal);
        expect(typeof opts.idGen).toBe('function');

        // Adapter rendered the events onto the target.
        expect(rec.calls.some(c => c.m === 'updateMessage')).toBe(true);
        expect(rec.calls.some(c => c.m === 'setUsage')).toBe(true);
        expect(usage).toEqual({ inputTokens: 2, outputTokens: 1 });
    });

    it('builds a transportCall that invokes the configured transport and wraps the stream', async () => {
        const stream = new ReadableStream({ start(c) { c.enqueue({ type: 'text', delta: 'x' }); c.close(); } });
        const transportChat = vi.fn(async () => stream);
        const cfg = makeConfig(transportChat);
        const rec = makeRecorder();

        let bridged: unknown;
        const runner: AparteStreamRunner = async (opts) => {
            bridged = await opts.transportCall(opts.baseRequest);
            return undefined;
        };
        const client = new AparteClient({ config: cfg, autoRegister: false, streamRunner: runner });
        await runLoop(client, rec.el, cfg);

        expect(transportChat).toHaveBeenCalledOnce();
        // ReadableStream was wrapped into an AsyncIterable for the runner.
        expect(typeof (bridged as AsyncIterable<unknown>)[Symbol.asyncIterator]).toBe('function');
    });

    it('injects prefixSegments before delegating (mirrors the inline path)', async () => {
        const cfg = makeConfig(vi.fn(async () => ''));
        const rec = makeRecorder();
        const runner: AparteStreamRunner = async (opts) => { opts.emitter({ type: 'run-done' }); return undefined; };
        const client = new AparteClient({ config: cfg, autoRegister: false, streamRunner: runner });
        await runLoop(client, rec.el, cfg, {
            ...REQ,
            _meta: { prefixSegments: [{ id: 'pre-1', type: 'thinking', content: 'orchestrating', collapsed: true }] },
        });
        expect(rec.calls.some(c => c.m === 'addSegment' && (c.args[0] as { id: string }).id === 'pre-1')).toBe(true);
    });

    it('uses the inline loop (calls the transport) when no runner is injected', async () => {
        const stream = new ReadableStream({ start(c) { c.enqueue({ type: 'text', delta: 'hello' }); c.enqueue({ type: 'done' }); c.close(); } });
        const transportChat = vi.fn(async () => stream);
        const cfg = makeConfig(transportChat);
        const rec = makeRecorder();
        const client = new AparteClient({ config: cfg, autoRegister: false });
        await runLoop(client, rec.el, cfg);
        // No runner → the inline loop drives the transport itself.
        expect(transportChat).toHaveBeenCalledOnce();
    });
});
