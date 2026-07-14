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
