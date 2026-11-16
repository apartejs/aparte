/**
 * A chat whose turns run elsewhere still has models to choose from: `createModelCatalogue`
 * registers them as a provider that lists them and runs none.
 *
 * The page of a server loop registered no provider, so `<aparte-model-selector>` had nothing to
 * list and no model's capabilities were known. The way in was a provider of one's own whose
 * `chat()` rejected: the shape this helper ships, with an error that names the mistake when a
 * page without a runner sends anyway.
 */
import { describe, it, expect } from 'vitest';
import { AparteConfig } from '../aparte-config.js';
import { createModelCatalogue } from '../model-catalogue.js';
import { AparteError, AparteErrorCode } from '../../types/errors.js';

const catalogue = () => createModelCatalogue({
    id: 'server',
    name: 'Our models',
    description: 'Run by our server',
    models: [
        { id: 'qwen', name: 'Qwen3 32B', capabilities: { function_calling: true } },
        { id: 'gemma', name: 'Gemma 3 27B' },
    ],
} as Parameters<typeof createModelCatalogue>[0]);

describe('a model catalogue', () => {
    it('is a provider like any other to the config: listed, selectable, its model read', () => {
        const config = new AparteConfig();
        config.registerAIProvider(catalogue());
        expect(config.getAIProviders().map((p) => p.getMetadata())).toEqual([{ id: 'server', name: 'Our models', description: 'Run by our server' }]);
        expect(config.getAIProvider('server')!.getModels().map((m) => m.id)).toEqual(['qwen', 'gemma']);

        config.setModelConfig({ defaultProvider: 'server', defaultModel: 'qwen' });
        expect(config.getCurrentModel()?.name).toBe('Qwen3 32B');
    });

    it('selects its model on its own when it has one, as a one-model provider does', () => {
        const config = new AparteConfig();
        config.registerAIProvider(createModelCatalogue({ id: 'server', name: 'Server', models: [{ id: 'only', name: 'Only' }] }));
        expect(config.getModelConfig()).toMatchObject({ defaultProvider: 'server', defaultModel: 'only' });
    });

    it('answers no turn: a send that reaches it says what is missing', async () => {
        const provider = catalogue() as { chat: (...args: unknown[]) => Promise<unknown> };
        const error = await provider.chat({ messages: [], model: 'qwen' }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AparteError);
        expect((error as AparteError).code).toBe(AparteErrorCode.PROVIDER_MISCONFIGURED);
        expect((error as AparteError).message).toMatch(/stream runner/);
    });

    it('hands out copies, so a caller cannot change the list it was built with', () => {
        const provider = catalogue();
        provider.getModels().pop();
        expect(provider.getModels()).toHaveLength(2);
    });
});
