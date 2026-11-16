// @vitest-environment jsdom
/**
 * A pick is told from a revert: `aparte-model-change` says `picked`.
 *
 * Without `persist` the selector only announces a change, so an app can ask before switching
 * (what it costs, a model to load) and put the old model back with `setSelection()` when the
 * person cancels. That revert announced a change too, the same as a pick, and the app's own
 * dialog came back for it. A model catalogue (`createModelCatalogue`) is what a server-loop
 * chat lists here.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, createModelCatalogue } from '@aparte/core';
import type { AparteModelChangeEventDetail } from '@aparte/core';
import '../aparte-model-selector.js';

type Selector = HTMLElement & { setSelection(provider: string, model: string): void };

async function mount(): Promise<Selector> {
    const selector = document.createElement('aparte-model-selector') as Selector;
    document.body.appendChild(selector);
    await vi.waitFor(() => expect(selector.querySelectorAll('aparte-option').length).toBe(2));
    return selector;
}

describe('a model change', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('says picked when the person chose it, and not when code put the old one back', async () => {
        aparteGlobalConfig.registerAIProvider(createModelCatalogue({
            id: 'server',
            name: 'Our server',
            models: [{ id: 'small', name: 'Small' }, { id: 'large', name: 'Large' }],
        }));
        aparteGlobalConfig.setModelConfig({ defaultProvider: 'server', defaultModel: 'small' });
        const selector = await mount();
        const seen: AparteModelChangeEventDetail[] = [];
        selector.addEventListener('aparte-model-change', (e) => {
            const detail = (e as CustomEvent<AparteModelChangeEventDetail>).detail;
            seen.push(detail);
            // The app asks, the person cancels: the old model goes back.
            if (detail.picked) selector.setSelection(detail.previousProviderId!, detail.previousModelId!);
        });

        selector.querySelector('aparte-select')!.dispatchEvent(
            new CustomEvent('aparte-select-change', { bubbles: true, detail: { value: 'server::large' } }),
        );

        expect(seen.map((d) => [d.modelId, d.picked])).toEqual([['large', true], ['small', false]]);
    });
});
