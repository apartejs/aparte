/**
 * A fetched model list has to reach `getCurrentModel()`, or no tool is ever sent.
 *
 * `AparteClient._toolsForCurrentModel()` gates the request's `tools` array on
 * `getCurrentModel()?.capabilities?.includes('function_calling')`. That resolver
 * read `provider.getModels()` — the SYNCHRONOUS, hand-declared list — and every
 * preset of `@aparte/provider-openai-compat` leaves it empty, because a compat
 * endpoint's list only exists after a `GET /models`. So on the documented primary
 * path the current model was `undefined`, the capability was absent, and the tools
 * array was stripped on every turn.
 *
 * The symptom is a model that answers, correctly and confusingly, that it has no
 * such tool — which is what a user reported while testing against LM Studio. No
 * error, no warning; a registered tool, a human-in-the-loop approval gate and the
 * whole elicitation path simply never happened.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig } from '../aparte-config.js';
import type { AparteAIProvider, AparteAIModel } from '../../types/index.js';

/** A provider whose models exist only at runtime — i.e. every compat endpoint. */
function fetchOnlyProvider(id: string, models: AparteAIModel[]): AparteAIProvider {
    return {
        id,
        getMetadata: () => ({ id, name: `Provider ${id}` }),
        // Empty on purpose: this is what `presets.LMSTUDIO` and friends return.
        getModels: () => [],
        fetchModels: async () => models,
    } as unknown as AparteAIProvider;
}

describe('the current model can come from a fetched list', () => {
    const cfg = new AparteConfig();
    afterEach(() => cfg.reset());

    it('resolves the model, and its capabilities, after a refresh', async () => {
        cfg.registerAIProvider(fetchOnlyProvider('lmstudio', [
            { id: 'qwen3-8b', name: 'Qwen3 8B', capabilities: ['streaming', 'function_calling'] },
        ]));
        cfg.setModelConfig({ defaultProvider: 'lmstudio', defaultModel: 'qwen3-8b' });

        // Before the fetch there is nothing to resolve — that is honest, not a bug.
        expect(cfg.getCurrentModel()).toBeUndefined();

        await cfg.refreshProviderModels('lmstudio');

        expect(cfg.getCurrentModel()?.id).toBe('qwen3-8b');
        expect(cfg.getCurrentModel()?.capabilities).toContain('function_calling');
    });

    it('a statically declared list still wins when the fetch has not run', async () => {
        const provider = {
            id: 'static',
            getMetadata: () => ({ id: 'static', name: 'Static' }),
            getModels: () => [{ id: 'm1', name: 'M1', capabilities: ['streaming'] }],
            fetchModels: async () => [],
        } as unknown as AparteAIProvider;
        cfg.registerAIProvider(provider);
        cfg.setModelConfig({ defaultProvider: 'static', defaultModel: 'm1' });

        expect(cfg.getCurrentModel()?.id).toBe('m1');
    });

    it('a refresh that returns nothing does not erase a static declaration', async () => {
        const provider = {
            id: 'static',
            getMetadata: () => ({ id: 'static', name: 'Static' }),
            getModels: () => [{ id: 'm1', name: 'M1', capabilities: ['streaming'] }],
            // A local server that is not running answers exactly like this.
            fetchModels: async () => [],
        } as unknown as AparteAIProvider;
        cfg.registerAIProvider(provider);
        cfg.setModelConfig({ defaultProvider: 'static', defaultModel: 'm1' });

        await cfg.refreshProviderModels('static');

        expect(cfg.getCurrentModel()?.id).toBe('m1');
    });

    it('reset drops the cache — a stale model must not outlive its provider', async () => {
        cfg.registerAIProvider(fetchOnlyProvider('lmstudio', [{ id: 'qwen3-8b', name: 'Qwen3 8B' }]));
        cfg.setModelConfig({ defaultProvider: 'lmstudio', defaultModel: 'qwen3-8b' });
        await cfg.refreshProviderModels('lmstudio');
        expect(cfg.getCurrentModel()?.id).toBe('qwen3-8b');

        cfg.reset();

        expect(cfg.getCurrentModel()).toBeUndefined();
    });
});
