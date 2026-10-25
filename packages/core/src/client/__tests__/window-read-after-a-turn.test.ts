/**
 * A model that came without a window gets it after its first reply.
 *
 * A local server that loads a model on its first request (LM Studio's just-in-time
 * loading, Ollama) has no loaded window to report when the list is fetched at start-up.
 * After a reply the model is loaded, so the client asks the provider's list again — once
 * per model — and the config announces the window when it appears. A list that comes back
 * empty (a failed fetch) must not wipe the one already held.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteAIModel, AparteMessage } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';

function chat() {
    const messages: AparteMessage[] = [];
    const el = document.createElement('div');
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: () => {}, updateSegment: () => {}, updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
    });
    document.body.appendChild(el);
    return el;
}

function setup(lists: AparteAIModel[][]) {
    const cfg = new AparteConfig();
    const fetchModels = vi.fn(async () => lists.shift() ?? []);
    cfg.registerAIProvider({ id: 'local', getMetadata: () => ({ id: 'local', name: 'L' }), getModels: () => [], fetchModels, chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'local', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    const el = chat();
    const streamRunner = async (opts: AparteStreamRunOptions) => {
        opts.emitter({ type: 'run-start' });
        opts.emitter({ type: 'text-delta', delta: 'Hello.' });
        opts.emitter({ type: 'text-flush' });
        opts.emitter({ type: 'run-done' });
        return undefined;
    };
    const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never, streamRunner } as never);
    const send = async (content: string) => {
        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(new CustomEvent('aparte-send', { detail: { content } }));
        await new Promise((r) => setTimeout(r, 0));
    };
    return { cfg, fetchModels, send };
}

describe('the window of a model that had none', () => {
    it('is read again after the first reply, announced, and not asked for a second time', async () => {
        const { cfg, fetchModels, send } = setup([
            [{ id: 'm', name: 'M' }],                          // the start-up list: not loaded yet
            [{ id: 'm', name: 'M', contextWindow: 4096 }],     // after the first reply: loaded
        ]);
        await cfg.refreshProviderModels('local');
        expect(cfg.getCurrentModel()?.contextWindow).toBeUndefined();
        const changes = vi.fn();
        cfg.subscribe(changes);

        await send('one');
        expect(fetchModels).toHaveBeenCalledTimes(2);
        expect(cfg.getCurrentModel()?.contextWindow).toBe(4096);
        expect(changes).toHaveBeenCalled();

        await send('two');
        expect(fetchModels).toHaveBeenCalledTimes(2);
    });

    it('is asked for once only when the server never says', async () => {
        const { cfg, fetchModels, send } = setup([[{ id: 'm', name: 'M' }], [{ id: 'm', name: 'M' }], [{ id: 'm', name: 'M' }]]);
        await cfg.refreshProviderModels('local');
        await send('one');
        await send('two');
        expect(fetchModels).toHaveBeenCalledTimes(2);
    });

    it('keeps the list it holds when a fetch comes back empty', async () => {
        const { cfg } = setup([[{ id: 'm', name: 'M', capabilities: ['function_calling'] }], []]);
        await cfg.refreshProviderModels('local');
        const changes = vi.fn();
        cfg.subscribe(changes);
        await cfg.refreshProviderModels('local');
        expect(cfg.getCurrentModel()).toMatchObject({ id: 'm', capabilities: ['function_calling'] });
        expect(changes).not.toHaveBeenCalled();
    });
});
