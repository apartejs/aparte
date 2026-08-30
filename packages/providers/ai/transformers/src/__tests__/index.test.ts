import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getLoadedModelId,
    terminateWorker,
    listCachedModels,
    deleteCachedModel,
    setMaxCachedModels,
    getMaxCachedModels,
    registerModel,
    TransformersProvider,
    runnerCommand,
    type CachedModelEntry,
} from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// Worker stub — prevents real Worker instantiation in jsdom
// ─────────────────────────────────────────────────────────────────────────────

const workerTerminate = vi.fn();
const workerPostMessage = vi.fn();
const workerAddEventListener = vi.fn();

class StubWorker {
    addEventListener = workerAddEventListener;
    postMessage = workerPostMessage;
    terminate = workerTerminate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache API helpers
// ─────────────────────────────────────────────────────────────────────────────

function stubCaches(models: { url: string; size?: number }[]) {
    const deleteMock = vi.fn().mockResolvedValue(true);
    const requests = models.map(m => ({ url: m.url } as Request));
    const cache = {
        keys: vi.fn().mockResolvedValue(requests),
        match: vi.fn((req: Request) => {
            const entry = models.find(m => m.url === req.url);
            if (!entry) return Promise.resolve(undefined);
            const headers = new Headers();
            if (entry.size !== undefined) headers.set('content-length', String(entry.size));
            return Promise.resolve(new Response(null, { headers }));
        }),
        delete: deleteMock,
    };
    vi.stubGlobal('caches', {
        keys: vi.fn().mockResolvedValue(['transformers-cache']),
        open: vi.fn().mockResolvedValue(cache),
    });
    return { cache, deleteMock };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.stubGlobal('Worker', StubWorker);
    workerTerminate.mockClear();
    workerPostMessage.mockClear();
    workerAddEventListener.mockClear();
});

afterEach(() => {
    terminateWorker();       // reset module-level state between tests
    setMaxCachedModels(1);   // restore default cache limit
    vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// getLoadedModelId
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// The runner protocol, main-thread side
// ─────────────────────────────────────────────────────────────────────────────

/** The `message` handler `_getWorker()` registered on the stub — the worker's voice. */
function workerHandler(): (e: { data: unknown }) => void {
    const call = workerAddEventListener.mock.calls.find((args) => args[0] === 'message');
    if (!call) throw new Error('the worker has not been spawned yet');
    return call[1] as (e: { data: unknown }) => void;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Read the stream a `chat()` returned to the end. */
async function readAll(stream: ReadableStream<unknown>): Promise<unknown[]> {
    const out: unknown[] = [];
    const reader = stream.getReader();
    for (;;) {
        const { value, done } = await reader.read();
        if (done) return out;
        out.push(value);
    }
}

describe('chat() hands the worker the conversation, not a flattening of it', () => {
    beforeEach(() => { vi.stubGlobal('crypto', { randomUUID: () => 'req-1' }); });

    it('posts the messages with their content parts, and the task the model was registered with', async () => {
        registerModel({ id: 'Test/VLM', name: 'VLM', capabilities: ['streaming', 'vision'], task: 'image-text-to-text' });
        const messages = [{ role: 'user', content: [{ type: 'text', text: 'what is this?' }, { type: 'image', image: 'data:image/png;base64,AAAA' }] }];
        void TransformersProvider.chat({ modelId: 'Test/VLM', messages } as never);
        await flush();
        const generate = workerPostMessage.mock.calls.map((c) => c[0]).find((m) => m.type === 'generate');
        expect(generate).toMatchObject({ modelId: 'Test/VLM', task: 'image-text-to-text', messages });
        expect(generate.runner).toBeUndefined();
    });

    it('defaults the task to text-generation for a model registered without one', async () => {
        registerModel({ id: 'Test/Text', name: 'Text', capabilities: ['streaming'] });
        void TransformersProvider.chat({ modelId: 'Test/Text', messages: [{ role: 'user', content: 'hi' }] } as never);
        await flush();
        const generate = workerPostMessage.mock.calls.map((c) => c[0]).find((m) => m.type === 'generate');
        expect(generate.task).toBe('text-generation');
    });

    it('posts a custom runner as an ABSOLUTE url — the worker does not share the page\'s base', async () => {
        registerModel({ id: 'Test/Custom', name: 'Custom', capabilities: ['streaming'], runner: './runners/mine.js' });
        void TransformersProvider.chat({ modelId: 'Test/Custom', messages: [{ role: 'user', content: 'hi' }] } as never);
        await flush();
        const generate = workerPostMessage.mock.calls.map((c) => c[0]).find((m) => m.type === 'generate');
        expect(generate.runner).toBe(new URL('./runners/mine.js', location.href).href);
        expect(generate.runner).toMatch(/^https?:\/\//);
    });
});

describe('what comes back from the worker', () => {
    beforeEach(() => { vi.stubGlobal('crypto', { randomUUID: () => 'req-1' }); });

    it('forwards a gen-event verbatim — a thinking event reaches the stream as itself', async () => {
        const stream = await TransformersProvider.chat({ modelId: 'Test/Text', messages: [{ role: 'user', content: 'hi' }] } as never) as ReadableStream<unknown>;
        const reading = readAll(stream);
        await flush();
        const worker = workerHandler();
        worker({ data: { type: 'gen-event', id: 'req-1', event: { type: 'thinking', delta: 'hm' } } });
        worker({ data: { type: 'gen-event', id: 'req-1', event: { type: 'text', delta: 'Hello' } } });
        worker({ data: { type: 'gen-done', id: 'req-1', usage: { inputTokens: 3, outputTokens: 1 } } });
        expect(await reading).toEqual([
            { type: 'thinking', delta: 'hm' },
            { type: 'text', delta: 'Hello' },
            { type: 'done', usage: { inputTokens: 3, outputTokens: 1 } },
        ]);
    });

    it('a warning from the worker reaches the console, prefixed (the worker itself says each once)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        void TransformersProvider.prepareModel('Test/Text', vi.fn()).catch(() => {});
        const worker = workerHandler();
        worker({ data: { type: 'warning', message: 'image parts were dropped' } });
        worker({ data: { type: 'warning', message: 'tool turns were dropped' } });
        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls[0]?.[0]).toBe('[transformers] image parts were dropped');
        expect(warn.mock.calls[1]?.[0]).toBe('[transformers] tool turns were dropped');
        warn.mockRestore();
    });
});

describe('runnerCommand', () => {
    beforeEach(() => { vi.stubGlobal('crypto', { randomUUID: () => 'cmd-1' }); });

    it('posts a command carrying the model\'s selection and resolves with the runner\'s result', async () => {
        registerModel({ id: 'Test/Custom', name: 'Custom', capabilities: ['streaming'], runner: 'https://app.example/runner.js', dtype: 'q4' });
        const pending = runnerCommand('Test/Custom', 'adapter', { name: 'poet' });
        await flush();
        const command = workerPostMessage.mock.calls.map((c) => c[0]).find((m) => m.type === 'command');
        expect(command).toMatchObject({ id: 'cmd-1', modelId: 'Test/Custom', name: 'adapter', payload: { name: 'poet' }, runner: 'https://app.example/runner.js', dtype: 'q4' });
        workerHandler()({ data: { type: 'command-result', id: 'cmd-1', result: { swapped: true } } });
        await expect(pending).resolves.toEqual({ swapped: true });
    });

    it('rejects with the error the worker reports', async () => {
        const pending = runnerCommand('Test/Text', 'x', null);
        await flush();
        workerHandler()({ data: { type: 'command-result', id: 'cmd-1', error: 'This runner has no command handler' } });
        await expect(pending).rejects.toThrow(/command handler/);
    });

    it('waits its turn behind a generate in flight — the worker holds one runner', async () => {
        vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('gen-1').mockReturnValueOnce('cmd-1') });
        void TransformersProvider.chat({ modelId: 'Test/Text', messages: [{ role: 'user', content: 'hi' }] } as never);
        await flush();
        const pending = runnerCommand('Test/Text', 'x', null);
        await flush();
        const types = () => workerPostMessage.mock.calls.map((c) => c[0].type).filter((t) => t !== 'init');
        expect(types()).toEqual(['generate']);
        workerHandler()({ data: { type: 'gen-done', id: 'gen-1' } });
        await flush();
        expect(types()).toEqual(['generate', 'command']);
        // Still unanswered when the worker goes: the caller hears it, not the console.
        terminateWorker();
        await expect(pending).rejects.toThrow(/terminated/i);
    });
});

describe('getLoadedModelId', () => {
    it('returns null when no model has been loaded', () => {
        expect(getLoadedModelId()).toBeNull();
    });

    it('returns null after terminateWorker resets state', () => {
        terminateWorker();
        expect(getLoadedModelId()).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// terminateWorker
// ─────────────────────────────────────────────────────────────────────────────

describe('terminateWorker', () => {
    it('can be called safely when no worker is active', () => {
        expect(() => terminateWorker()).not.toThrow();
    });

    it('rejects in-flight prepares without throwing', () => {
        expect(() => terminateWorker()).not.toThrow();
        expect(getLoadedModelId()).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// listCachedModels
// ─────────────────────────────────────────────────────────────────────────────

describe('listCachedModels', () => {
    it('returns empty array when Cache API is unavailable', async () => {
        vi.stubGlobal('caches', undefined);
        const result = await listCachedModels();
        expect(result).toEqual([]);
    });

    it('returns empty array when no HF model URLs are cached', async () => {
        stubCaches([{ url: 'https://cdn.example.com/unknown-model/config.json' }]);
        const result = await listCachedModels();
        expect(result).toEqual([]);
    });

    it('returns an entry for a cached model', async () => {
        const modelId = 'onnx-community/Qwen2.5-0.5B-ONNX';
        stubCaches([
            { url: `https://huggingface.co/${modelId}/resolve/main/config.json`, size: 1024 },
            { url: `https://huggingface.co/${modelId}/resolve/main/model.onnx`, size: 204800 },
        ]);

        const result = await listCachedModels();
        expect(result).toHaveLength(1);
        const entry: CachedModelEntry = result[0]!;
        expect(entry.modelId).toBe(modelId);
        // Name is auto-generated from modelId (last segment, dashes → spaces)
        expect(entry.name).toBe('Qwen2.5 0.5B ONNX');
        expect(entry.sizeBytes).toBe(1024 + 204800);
        expect(entry.loaded).toBe(false);
    });

    it('handles caches.keys() rejection gracefully', async () => {
        vi.stubGlobal('caches', {
            keys: vi.fn().mockRejectedValue(new Error('Permission denied')),
            open: vi.fn(),
        });
        const result = await listCachedModels();
        expect(result).toEqual([]);
    });

    it('discovers any HF model from a cached URL', async () => {
        const modelId = 'Qwen/Qwen3-4B-ONNX';
        stubCaches([{ url: `https://huggingface.co/${modelId}/resolve/main/config.json`, size: 512 }]);
        const result = await listCachedModels();
        expect(result).toHaveLength(1);
        expect(result[0]!.modelId).toBe(modelId);
        expect(result[0]!.name).toBe('Qwen3 4B ONNX');
        expect(result[0]!.sizeBytes).toBe(512);
    });

    it('sums sizes across multiple cache stores', async () => {
        const modelId = 'onnx-community/Qwen2.5-0.5B-ONNX';
        const url1 = `https://huggingface.co/${modelId}/resolve/main/config.json`;
        const url2 = `https://huggingface.co/${modelId}/resolve/main/model.onnx`;

        const deleteMock = vi.fn().mockResolvedValue(true);
        const makeCache = (urls: string[], sizes: number[]) => ({
            keys: vi.fn().mockResolvedValue(urls.map(u => ({ url: u } as Request))),
            match: vi.fn((req: Request) => {
                const idx = urls.indexOf(req.url);
                if (idx < 0) return Promise.resolve(undefined);
                const h = new Headers();
                h.set('content-length', String(sizes[idx]));
                return Promise.resolve(new Response(null, { headers: h }));
            }),
            delete: deleteMock,
        });

        vi.stubGlobal('caches', {
            keys: vi.fn().mockResolvedValue(['store-a', 'store-b']),
            open: vi.fn()
                .mockResolvedValueOnce(makeCache([url1], [1000]))
                .mockResolvedValueOnce(makeCache([url2], [5000])),
        });

        const result = await listCachedModels();
        expect(result[0]!.sizeBytes).toBe(6000);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteCachedModel
// ─────────────────────────────────────────────────────────────────────────────

describe('deleteCachedModel', () => {
    it('does nothing when Cache API is unavailable', async () => {
        vi.stubGlobal('caches', undefined);
        await expect(deleteCachedModel('onnx-community/Qwen2.5-0.5B-ONNX')).resolves.toBeUndefined();
    });

    it('deletes all matching cache entries for the model', async () => {
        const modelId = 'onnx-community/Qwen2.5-0.5B-ONNX';
        const url1 = `https://huggingface.co/${modelId}/resolve/main/config.json`;
        const url2 = `https://huggingface.co/${modelId}/resolve/main/model.onnx`;
        const urlOther = 'https://cdn.example.com/other-model/config.json';

        const { deleteMock } = stubCaches([
            { url: url1 },
            { url: url2 },
            { url: urlOther },
        ]);

        await deleteCachedModel(modelId);
        // Only the two matching entries should be deleted
        expect(deleteMock).toHaveBeenCalledTimes(2);
    });

    it('deletes nothing when no entries match the model', async () => {
        const { deleteMock } = stubCaches([
            { url: 'https://cdn.example.com/other-model/config.json' },
        ]);
        await deleteCachedModel('onnx-community/Qwen2.5-0.5B-ONNX');
        expect(deleteMock).not.toHaveBeenCalled();
    });

    it('handles caches.keys() rejection gracefully', async () => {
        vi.stubGlobal('caches', {
            keys: vi.fn().mockRejectedValue(new Error('Permission denied')),
            open: vi.fn(),
        });
        await expect(deleteCachedModel('onnx-community/Qwen2.5-0.5B-ONNX')).resolves.toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// setMaxCachedModels / getMaxCachedModels
// ─────────────────────────────────────────────────────────────────────────────

describe('setMaxCachedModels / getMaxCachedModels', () => {
    it('defaults to 1', () => {
        expect(getMaxCachedModels()).toBe(1);
    });

    it('updates the limit', () => {
        setMaxCachedModels(3);
        expect(getMaxCachedModels()).toBe(3);
    });

    it('accepts 0 for unlimited', () => {
        setMaxCachedModels(0);
        expect(getMaxCachedModels()).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchModels / getModels — cache persistence (download → reload flow)
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchModels / getModels — cache persistence', () => {
    it('includes registered models even when cache is empty', async () => {
        registerModel({ id: 'Test/Reg-A-ONNX', name: 'Reg A', capabilities: ['streaming'], task: 'text-generation' });
        registerModel({ id: 'Test/Reg-B-ONNX', name: 'Reg B', capabilities: ['streaming'], task: 'text-generation' });
        registerModel({ id: 'Test/Reg-C-ONNX', name: 'Reg C', capabilities: ['streaming'], task: 'text-generation' });

        vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue([]) });
        const models = await TransformersProvider.fetchModels!();

        expect(models.length).toBeGreaterThanOrEqual(3);
        expect(models.find(m => m.id === 'Test/Reg-A-ONNX')).toBeDefined();
        expect(models.find(m => m.id === 'Test/Reg-B-ONNX')).toBeDefined();
        expect(models.find(m => m.id === 'Test/Reg-C-ONNX')).toBeDefined();
    });

    it('adds a cache-only model to getModels() after fetchModels()', async () => {
        const modelId = 'Org/FetchModels-CacheOnly-Test-ONNX';
        expect((TransformersProvider.getModels() as { id: string }[]).map(m => m.id)).not.toContain(modelId);

        stubCaches([{ url: `https://huggingface.co/${modelId}/resolve/main/config.json`, size: 256 }]);
        await TransformersProvider.fetchModels!();

        expect((TransformersProvider.getModels() as { id: string }[]).map(m => m.id)).toContain(modelId);
    });

    it('fetchModels() return value includes the cache-only model', async () => {
        const modelId = 'Org/FetchModels-Return-Test-ONNX';
        stubCaches([{ url: `https://huggingface.co/${modelId}/resolve/main/config.json`, size: 256 }]);
        const fetched = await TransformersProvider.fetchModels!();
        expect(fetched.find(m => m.id === modelId)).toBeDefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getModelStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('getModelStatus', () => {
    it('returns "not-downloaded" when model is not in cache', async () => {
        vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue([]) });
        const status = await TransformersProvider.getModelStatus!('onnx-community/Qwen2.5-0.5B-ONNX');
        expect(status).toBe('not-downloaded');
    });

    it('returns "cached" when a model URL is present in cache', async () => {
        const modelId = 'onnx-community/Qwen2.5-0.5B-ONNX';
        stubCaches([{ url: `https://huggingface.co/${modelId}/resolve/main/model.onnx` }]);
        const status = await TransformersProvider.getModelStatus!(modelId);
        expect(status).toBe('cached');
    });

    it('returns "ready" when the model is loaded in the worker', async () => {
        vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue([]) });
        const modelId = 'onnx-community/Qwen2.5-0.5B-ONNX';

        // Start preparation to trigger worker creation (do not await — waits for worker messages)
        void TransformersProvider.prepareModel!(modelId, vi.fn()).catch(() => {});

        // Retrieve the message handler registered on the StubWorker
        const [, msgHandler] = workerAddEventListener.mock.calls.find((args) => args[0] === 'message')!;

        // Simulate the worker reporting the pipeline is ready
        msgHandler({ data: { type: 'pipeline-ready', modelId } });

        expect(getLoadedModelId()).toBe(modelId);
        const status = await TransformersProvider.getModelStatus!(modelId);
        expect(status).toBe('ready');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache eviction — triggered by pipeline-ready
// ─────────────────────────────────────────────────────────────────────────────

describe('cache eviction on pipeline-ready', () => {
    it('evicts excess cached models when count exceeds the limit', async () => {
        const keepId = 'onnx-community/Qwen2.5-0.5B-ONNX';
        const evictId = 'onnx-community/Llama-3.2-1B-ONNX';

        setMaxCachedModels(1);
        const { deleteMock } = stubCaches([
            { url: `https://huggingface.co/${keepId}/resolve/main/config.json`, size: 100 },
            { url: `https://huggingface.co/${evictId}/resolve/main/config.json`, size: 200 },
        ]);

        void TransformersProvider.prepareModel!(keepId, vi.fn()).catch(() => {});
        const [, msgHandler] = workerAddEventListener.mock.calls.find((args) => args[0] === 'message')!;
        msgHandler({ data: { type: 'pipeline-ready', modelId: keepId } });

        // Drain microtasks: the macrotask runs only after all pending microtasks complete
        await new Promise(r => setTimeout(r, 0));

        expect(deleteMock).toHaveBeenCalled();
        const deleted = deleteMock.mock.calls[0]![0] as { url: string };
        expect(deleted.url).toContain(evictId);
    });

    it('does not evict when the limit is 0 (unlimited)', async () => {
        const modelId = 'onnx-community/Qwen2.5-0.5B-ONNX';
        const otherId = 'onnx-community/Llama-3.2-1B-ONNX';

        setMaxCachedModels(0);
        const { deleteMock } = stubCaches([
            { url: `https://huggingface.co/${modelId}/resolve/main/config.json`, size: 100 },
            { url: `https://huggingface.co/${otherId}/resolve/main/config.json`, size: 200 },
        ]);

        void TransformersProvider.prepareModel!(modelId, vi.fn()).catch(() => {});
        const [, msgHandler] = workerAddEventListener.mock.calls.find((args) => args[0] === 'message')!;
        msgHandler({ data: { type: 'pipeline-ready', modelId } });

        await new Promise(r => setTimeout(r, 0));
        expect(deleteMock).not.toHaveBeenCalled();
    });

    it('never evicts the model that just became ready', async () => {
        const modelId = 'onnx-community/Qwen2.5-0.5B-ONNX';

        setMaxCachedModels(1);
        const { deleteMock } = stubCaches([
            { url: `https://huggingface.co/${modelId}/resolve/main/config.json`, size: 100 },
        ]);

        void TransformersProvider.prepareModel!(modelId, vi.fn()).catch(() => {});
        const [, msgHandler] = workerAddEventListener.mock.calls.find((args) => args[0] === 'message')!;
        msgHandler({ data: { type: 'pipeline-ready', modelId } });

        await new Promise(r => setTimeout(r, 0));
        // Only 1 model in cache and it's the one kept — nothing should be deleted
        expect(deleteMock).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ctx.signal — the transport's stop, which the contract says a bridge MUST honour
// ─────────────────────────────────────────────────────────────────────────────

describe('stop honours ctx.signal', () => {
    const request = { modelId: 'Test/Text', messages: [{ role: 'user', content: 'hi' }] } as never;
    const ctx = (signal: AbortSignal) => ({ providerId: 'transformers', signal });
    const posted = (type: string) => workerPostMessage.mock.calls.map((c) => c[0]).filter((m) => m.type === type);

    beforeEach(() => { vi.stubGlobal('crypto', { randomUUID: () => 'req-1' }); });

    it('aborting the signal posts ONE cancel for the generate in flight', async () => {
        const ac = new AbortController();
        void TransformersProvider.chat(request, undefined, ctx(ac.signal));
        await flush();
        expect(posted('generate')).toHaveLength(1);
        ac.abort();
        ac.abort();
        expect(posted('cancel')).toEqual([{ type: 'cancel', id: 'req-1' }]);
    });

    it('a signal already aborted never posts the generate, and the stream ends in an error', async () => {
        const ac = new AbortController();
        ac.abort();
        const stream = await TransformersProvider.chat(request, undefined, ctx(ac.signal)) as ReadableStream<unknown>;
        const events = await readAll(stream);
        expect(posted('generate')).toHaveLength(0);
        expect(events).toEqual([{ type: 'error', message: expect.stringMatching(/abort|cancel/i) }]);
    });

    it('cancelling the stream after the signal fired does not post a second cancel', async () => {
        const ac = new AbortController();
        const stream = await TransformersProvider.chat(request, undefined, ctx(ac.signal)) as ReadableStream<unknown>;
        await flush();
        ac.abort();
        await stream.cancel();
        expect(posted('cancel')).toHaveLength(1);
    });
});
