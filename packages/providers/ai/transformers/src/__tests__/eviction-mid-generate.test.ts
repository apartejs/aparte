/**
 * The cache budget must not evict the weights a generation is reading.
 *
 * `pipeline-ready` runs `_enforceMaxCachedModels(theNewModel)`, which deletes every
 * OTHER cached model down to the budget (1 by default). Two chats on one page, or a
 * `prepareModel` for a second model, therefore deleted the files of the model that
 * was answering — and `deleteCachedModel` also calls `terminateWorker()` when the
 * model is the loaded one. The worker now serialises its work, so the announcement
 * comes later; the budget still has to know that "queued or running" means "in use".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransformersProvider, terminateWorker, registerModel, setMaxCachedModels } from '../index';

const MODELS = ['org/model-a', 'org/model-b'];
const urlOf = (modelId: string) => `https://huggingface.co/${modelId}/resolve/main/config.json`;

const workerPostMessage = vi.fn();
let onWorkerMessage: ((e: { data: unknown }) => void) | undefined;
class StubWorker {
    addEventListener = vi.fn((type: string, fn: (e: { data: unknown }) => void) => {
        if (type === 'message') onWorkerMessage = fn;
    });
    postMessage = workerPostMessage;
    terminate = vi.fn();
}

const cacheDelete = vi.fn(async () => true);
function stubCaches() {
    const requests = MODELS.map(id => ({ url: urlOf(id) }));
    vi.stubGlobal('caches', {
        keys: vi.fn(async () => ['transformers-cache']),
        open: vi.fn(async () => ({
            keys: vi.fn(async () => requests),
            match: vi.fn(async () => new Response('x', { headers: { 'content-length': '10' } })),
            delete: cacheDelete,
        })),
    });
}

/** Which model ids the cache was asked to delete. */
const deletedModels = (): string[] => cacheDelete.mock.calls.map((call) => (call as unknown as [{ url: string }])[0].url);

async function startTurn(modelId: string): Promise<void> {
    const stream = await TransformersProvider.chat({ messages: [{ role: 'user', content: 'hi' }], modelId, stream: true });
    void (stream as ReadableStream).getReader().read();
    await Promise.resolve();
}

/** Let the eviction's promise chain (list → filter → delete) settle. */
const settle = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => {
    vi.stubGlobal('Worker', StubWorker);
    stubCaches();
    cacheDelete.mockClear();
    workerPostMessage.mockClear();
    onWorkerMessage = undefined;
    setMaxCachedModels(1);
    for (const id of MODELS) registerModel({ id, name: id, task: 'text-generation', capabilities: ['streaming'] });
});

afterEach(() => {
    terminateWorker();
    setMaxCachedModels(1);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('the cache budget and a generate in flight', () => {
    it('does not evict the model that is answering', async () => {
        await startTurn('org/model-a');
        expect(onWorkerMessage, 'the worker message handler is wired on first use').toBeTypeOf('function');

        // A second model finishes loading (another chat, or prepareModel).
        onWorkerMessage!({ data: { type: 'pipeline-ready', modelId: 'org/model-b' } });
        await settle();

        expect(deletedModels()).not.toContain(urlOf('org/model-a'));
    });

    it('still evicts a model nothing is using', async () => {
        // The control: with no generate in flight, the budget does its job — so the
        // test above is not passing because the eviction never runs.
        onWorkerMessage = undefined;
        await startTurn('org/model-b');
        onWorkerMessage!({ data: { type: 'gen-done', id: (workerPostMessage.mock.calls.find(([m]) => (m as { type: string }).type === 'generate')![0] as { id: string }).id } });
        await settle();
        cacheDelete.mockClear();

        onWorkerMessage!({ data: { type: 'pipeline-ready', modelId: 'org/model-b' } });
        await settle();

        expect(deletedModels()).toContain(urlOf('org/model-a'));
    });
});
