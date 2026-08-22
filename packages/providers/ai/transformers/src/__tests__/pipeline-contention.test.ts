/**
 * The single worker pipeline: what serializing generates costs, and the two ways
 * it used to go wrong silently.
 *
 * This provider's state is tab-scoped on purpose (see the module header): a local
 * model is 1–2 GB and one WebGPU pipeline, so handing every chat its own worker
 * would load N copies in one tab. The cost of that decision is that two chats
 * queue behind each other — and both failures below were invisible, which is the
 * part that was wrong.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransformersProvider, terminateWorker, registerModel } from '../index';

const workerPostMessage = vi.fn();
class StubWorker {
    addEventListener = vi.fn();
    postMessage = workerPostMessage;
    terminate = vi.fn();
}

/** Start a streamed turn and pull once, so the stream's `start` actually runs. */
async function startTurn(modelId: string): Promise<ReadableStreamDefaultReader<unknown>> {
    const stream = await TransformersProvider.chat({
        messages: [{ role: 'user', content: 'hi' }],
        modelId,
        stream: true,
    });
    const reader = (stream as ReadableStream).getReader();
    void reader.read();
    return reader as ReadableStreamDefaultReader<unknown>;
}

/** Did the worker receive a `generate` for this model? */
function postedGenerateFor(modelId: string): boolean {
    return workerPostMessage.mock.calls.some(
        ([msg]) => (msg as { type: string; modelId: string }).type === 'generate'
            && (msg as { modelId: string }).modelId === modelId,
    );
}

beforeEach(() => {
    vi.stubGlobal('Worker', StubWorker);
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue([]) });
    workerPostMessage.mockClear();
    registerModel({ id: 'model-a', name: 'A', task: 'text-generation', capabilities: ['streaming'] });
    registerModel({ id: 'model-b', name: 'B', task: 'text-generation', capabilities: ['streaming'] });
});

afterEach(() => {
    terminateWorker();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('the single pipeline', () => {
    it('survives terminateWorker() called mid-generate', async () => {
        // The worker-error handler releases every serialization slot and resets the
        // chain, and says why in a comment ("so the generate chain doesn't
        // deadlock"). `terminateWorker` — 240 lines below it — did not: it dropped
        // the pending generates but left their slots unresolved, so `_generateChain`
        // stayed pending forever and the NEXT chat() awaited a promise that could
        // never settle. No error, no rejection: the stream simply never started, for
        // the rest of the page's life. The test suite's own `afterEach` calls
        // terminateWorker to reset module state, which is the same trap.
        await startTurn('model-a');
        expect(postedGenerateFor('model-a')).toBe(true);

        terminateWorker();
        workerPostMessage.mockClear();

        await startTurn('model-b');
        // A microtask is enough: the chain must already be resolved, not merely
        // resolvable. Before the fix this stayed false forever.
        await Promise.resolve();
        expect(postedGenerateFor('model-b')).toBe(true);
    });

    it('warns once when two chats drive different models at the same time', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });

        // First turn goes straight through — nothing to contend with.
        await startTurn('model-a');
        expect(warn).not.toHaveBeenCalled();

        // Second chat, different model, while the first is still in flight: this is
        // the case that evicts and reloads gigabytes between every turn.
        await startTurn('model-b');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('different local models');
        expect(warn.mock.calls[0]?.[0]).toContain('model-b');
        expect(warn.mock.calls[0]?.[0]).toContain('model-a');

        // Once, not per turn.
        await startTurn('model-a');
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stays quiet when both chats use the same model', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
        await startTurn('model-a');
        await startTurn('model-a');
        // Sharing one loaded model between two chats is the case this design is FOR.
        expect(warn).not.toHaveBeenCalled();
    });
});
