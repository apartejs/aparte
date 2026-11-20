// @vitest-environment jsdom
/**
 * A catalogue replaced while the picker is on screen is listed: the new models, never an empty
 * list, never the old one.
 *
 * An app that lists its local models replaces its catalogue when the list changes (a download
 * finished): `unregisterAIProvider(id)`, then `registerAIProvider(...)` with the new models,
 * then `setModelConfig(...)`, one after the other (apartejs/aparte#276). The unregister started
 * a load of no provider; the register then compared the providers with the key of the list
 * loaded BEFORE, found it equal, and took the "nothing changed" path while that load was still
 * running, which then wrote an empty list. And a catalogue replaced under the same id was never
 * loaded again at all: the key held the ids only.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, createModelCatalogue } from '@aparte/core';
import '../aparte-model-selector.js';

const catalogue = (models: string[]) => createModelCatalogue({
    id: 'local',
    name: 'Local models',
    models: models.map((id) => ({ id, name: id })),
});

const options = (selector: HTMLElement): string[] =>
    [...selector.querySelectorAll('aparte-option')].map((o) => o.getAttribute('value') ?? '');

async function mount(): Promise<HTMLElement> {
    const selector = document.createElement('aparte-model-selector');
    document.body.appendChild(selector);
    await vi.waitFor(() => expect(options(selector)).toEqual(['local::small']));
    return selector;
}

describe('a catalogue replaced while the picker is mounted', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('unregistered, registered again and the same selection set, one after the other: the new models', async () => {
        aparteGlobalConfig.registerAIProvider(catalogue(['small']));
        aparteGlobalConfig.setModelConfig({ defaultProvider: 'local', defaultModel: 'small' });
        const selector = await mount();

        aparteGlobalConfig.unregisterAIProvider('local');
        aparteGlobalConfig.registerAIProvider(catalogue(['small', 'large']));
        aparteGlobalConfig.setModelConfig({ defaultProvider: 'local', defaultModel: 'small' });

        await vi.waitFor(() => expect(options(selector)).toEqual(['local::small', 'local::large']));
    });

    it('unregistered and the same catalogue registered back at once (switched off and on): still listed', async () => {
        const local = catalogue(['small']);
        aparteGlobalConfig.registerAIProvider(local);
        aparteGlobalConfig.setModelConfig({ defaultProvider: 'local', defaultModel: 'small' });
        const selector = await mount();

        // The providers are then exactly those of the list on screen, while the load the
        // unregister started, which saw none, is still running.
        aparteGlobalConfig.unregisterAIProvider('local');
        aparteGlobalConfig.registerAIProvider(local);

        await new Promise((resolve) => setTimeout(resolve, 50));
        await vi.waitFor(() => expect(options(selector)).toEqual(['local::small']));
    });

    it('registered again under the same id, nothing unregistered: the new models', async () => {
        aparteGlobalConfig.registerAIProvider(catalogue(['small']));
        aparteGlobalConfig.setModelConfig({ defaultProvider: 'local', defaultModel: 'small' });
        const selector = await mount();

        aparteGlobalConfig.registerAIProvider(catalogue(['small', 'large']));

        await vi.waitFor(() => expect(options(selector)).toEqual(['local::small', 'local::large']));
    });
});
