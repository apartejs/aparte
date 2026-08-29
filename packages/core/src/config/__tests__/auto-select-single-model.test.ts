import { describe, it, expect } from 'vitest';
import { AparteConfig } from '../aparte-config';

/**
 * One provider, one model, nothing selected: there is no choice to make, so it is
 * made (issue #29 — a scripted provider on a page with no model selector sent
 * nothing, silently).
 */
const provider = (id: string, models: string[]) => ({
    id,
    getMetadata: () => ({ id, name: id }),
    getModels: () => models.map((m) => ({ id: m, name: m })),
    chat: async () => '',
}) as never;

describe('registerAIProvider — the only model of the only provider is selected on its own', () => {
    it('selects it', () => {
        const c = new AparteConfig();
        c.registerAIProvider(provider('scripted', ['only']));
        expect(c.hasSelectedModel()).toBe(true);
        expect(c.getModelConfig()).toMatchObject({ defaultProvider: 'scripted', defaultModel: 'only' });
    });

    it('does not choose among several models — that is the user\'s or the selector\'s', () => {
        const c = new AparteConfig();
        c.registerAIProvider(provider('p', ['a', 'b']));
        expect(c.hasSelectedModel()).toBe(false);
    });

    it('does not choose among several providers either', () => {
        const c = new AparteConfig();
        c.registerAIProvider(provider('p1', ['a']), provider('p2', ['b']));
        expect(c.hasSelectedModel()).toBe(false);
        // Nor when the second arrives later: the first one's choice stands, unchanged.
        const d = new AparteConfig();
        d.registerAIProvider(provider('p1', ['a']));
        d.registerAIProvider(provider('p2', ['b']));
        expect(d.getModelConfig()).toMatchObject({ defaultProvider: 'p1', defaultModel: 'a' });
    });

    it('never overrides a selection already made', () => {
        const c = new AparteConfig();
        c.setModelConfig({ defaultProvider: 'other', defaultModel: 'm' });
        c.registerAIProvider(provider('scripted', ['only']));
        expect(c.getModelConfig()).toMatchObject({ defaultProvider: 'other', defaultModel: 'm' });
    });

    it('a provider whose list is empty until a fetch selects nothing', () => {
        const c = new AparteConfig();
        c.registerAIProvider(provider('remote', []));
        expect(c.hasSelectedModel()).toBe(false);
    });
});
