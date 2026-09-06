/**
 * How long a client's `keyResolver` answers for the config it registered on.
 *
 * The client puts its resolver on the config so the model list — whose only data
 * path is `refreshProviderModels` — signs its request with the same credentials
 * the chat uses. That registration outlived the client: nothing released it, and
 * the oldest source answered first, so a stopped client kept signing requests, and
 * the remount the wrappers document as the way to swap options ("remount the
 * component that owns the hook") could not change the key. A resolver answers
 * while its client is listening, and the newest one answers first.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteClient } from '../aparte-client.js';
import type { AparteAIProvider, AparteAIModel } from '../../types/model-provider.js';

const clients: AparteClient[] = [];
function makeClient(config: AparteConfig, keyResolver: (id: string) => string | undefined): AparteClient {
    const client = new AparteClient({ config, autoRegister: false, keyResolver });
    clients.push(client);
    return client;
}
afterEach(() => { clients.splice(0).forEach((c) => c.stop()); });

function providerSpy(): { provider: AparteAIProvider; fetchModels: ReturnType<typeof vi.fn> } {
    const models: AparteAIModel[] = [{ id: 'm', name: 'M', capabilities: ['streaming'] }];
    const fetchModels = vi.fn(async () => models);
    const provider: AparteAIProvider = {
        id: 'vendor',
        getMetadata: () => ({ id: 'vendor', name: 'Vendor' }),
        getModels: () => [],
        fetchModels,
        chat: async () => '',
    };
    return { provider, fetchModels };
}

describe('a client\'s key source', () => {
    it('stops answering once the client is stopped', async () => {
        const cfg = new AparteConfig();
        cfg.setKeyProvider(() => 'sk-from-config');
        const client = makeClient(cfg, () => 'sk-from-the-client');

        expect(await cfg.getKey('vendor')).toBe('sk-from-the-client');

        client.stop();

        expect(await cfg.getKey('vendor')).toBe('sk-from-config');
    });

    it('answers again when a stopped client is started', async () => {
        const cfg = new AparteConfig();
        cfg.setKeyProvider(() => 'sk-from-config');
        const client = makeClient(cfg, () => 'sk-from-the-client');
        client.stop();

        client.start();

        expect(await cfg.getKey('vendor')).toBe('sk-from-the-client');
    });

    it('lets a remounted client answer, not the one it replaced', async () => {
        const cfg = new AparteConfig();
        makeClient(cfg, () => 'sk-stale').stop();
        makeClient(cfg, () => 'sk-fresh');

        expect(await cfg.getKey('vendor')).toBe('sk-fresh');
    });

    it('gives the model list the newest client\'s key when two share a config', async () => {
        const cfg = new AparteConfig();
        const { provider, fetchModels } = providerSpy();
        cfg.registerAIProvider(provider);
        makeClient(cfg, () => 'sk-first-chat');
        makeClient(cfg, () => 'sk-second-chat');

        await cfg.refreshProviderModels('vendor');

        expect(fetchModels).toHaveBeenCalledWith('sk-second-chat');
    });

    it('survives the unmount of another client that was handed the same resolver', async () => {
        const cfg = new AparteConfig();
        const keyResolver = () => 'sk-shared';
        const first = makeClient(cfg, keyResolver);
        makeClient(cfg, keyResolver);

        first.stop();

        expect(await cfg.getKey('vendor')).toBe('sk-shared');
    });
});
