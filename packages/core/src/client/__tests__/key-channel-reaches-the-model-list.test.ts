/**
 * The key channel and the model list, which used to disagree.
 *
 * Two channels carry a provider's credentials — `AparteClient({ keyResolver })`,
 * which the docs teach as THE way, and `config.setKeyProvider()`, which they call
 * an alternative — and `refreshProviderModels()` (the model selector's only data
 * path) could see neither properly:
 *
 *  - it read `config.getKey` alone, so the documented primary channel produced an
 *    empty picker on every cloud provider, with a working chat and no warning;
 *  - `AparteKeyProvider` was typed as returning a string, so the `{ apiKey,
 *    endpoint }` record the CHAT honours could not travel on it — the model list
 *    went to the vendor's default host carrying the key the user entered for their
 *    own endpoint.
 *
 * One resolution order now answers both questions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteClient } from '../aparte-client.js';
import type { AparteAIProvider, AparteAIModel } from '../../types/model-provider.js';

let client: AparteClient | null = null;
afterEach(() => { client?.stop(); client = null; });

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

describe('refreshProviderModels and the key channels', () => {
    it('carries the endpoint a key provider returns, not just the key', async () => {
        // `{ apiKey, endpoint }` is the shape the transport already reads (`readAuth`)
        // and the shape `fetchModels` already accepts; only the type on this channel
        // refused it, which is why `GET {vendor default}/models` went out with a key
        // meant for a proxy, a self-hosted vLLM or an LM Studio box.
        const cfg = new AparteConfig();
        const { provider, fetchModels } = providerSpy();
        cfg.registerAIProvider(provider);
        cfg.setKeyProvider(() => ({ apiKey: 'sk-proxy-key', endpoint: 'https://llm.internal.example/v1' }));

        await cfg.refreshProviderModels('vendor');

        expect(fetchModels).toHaveBeenCalledWith({ apiKey: 'sk-proxy-key', endpoint: 'https://llm.internal.example/v1' });
    });

    it('reaches the keyResolver an AparteClient was given', async () => {
        // The primary documented channel. Nothing told a consumer to ALSO call
        // setKeyProvider, so a picker on a cloud provider was simply empty
        // (`fetchModels` returns [] without a key) and read as "the vendor returned
        // nothing".
        const cfg = new AparteConfig();
        const { provider, fetchModels } = providerSpy();
        cfg.registerAIProvider(provider);
        client = new AparteClient({ config: cfg, autoRegister: false, keyResolver: () => 'sk-real-key' });

        const models = await cfg.refreshProviderModels('vendor');

        expect(fetchModels).toHaveBeenCalledWith('sk-real-key');
        expect(models).toHaveLength(1);
    });

    it('is not hostage to the client: setKeyProvider alone still answers', async () => {
        const cfg = new AparteConfig();
        const { provider, fetchModels } = providerSpy();
        cfg.registerAIProvider(provider);
        cfg.setKeyProvider(() => 'sk-from-config');

        await cfg.refreshProviderModels('vendor');

        expect(fetchModels).toHaveBeenCalledWith('sk-from-config');
    });

    it('a client\'s resolver wins over setKeyProvider — the same order the chat uses', async () => {
        const cfg = new AparteConfig();
        const { provider, fetchModels } = providerSpy();
        cfg.registerAIProvider(provider);
        cfg.setKeyProvider(() => 'sk-from-config');
        client = new AparteClient({ config: cfg, autoRegister: false, keyResolver: () => 'sk-from-resolver' });

        expect(await cfg.getKey('vendor')).toBe('sk-from-resolver');
        await cfg.refreshProviderModels('vendor');
        expect(fetchModels).toHaveBeenCalledWith('sk-from-resolver');
    });

    it('falls through to setKeyProvider when the client\'s resolver has nothing for that provider', async () => {
        const cfg = new AparteConfig();
        const { provider, fetchModels } = providerSpy();
        cfg.registerAIProvider(provider);
        cfg.setKeyProvider(() => 'sk-from-config');
        client = new AparteClient({ config: cfg, autoRegister: false, keyResolver: (id) => (id === 'other' ? 'sk-other' : undefined) });

        await cfg.refreshProviderModels('vendor');

        expect(fetchModels).toHaveBeenCalledWith('sk-from-config');
    });
});
