// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteConfig, AparteConfigClass, attachConfig, detachConfig } from '@aparte/core';
import type { AparteAIProvider, AparteModelChangeEventDetail } from '@aparte/core';
import './aparte-model-selector.js';

function fakeProvider(id: string, modelName: string): AparteAIProvider {
    return {
        id,
        getMetadata: () => ({ id, name: `Provider ${id}` }),
        getModels: () => [{ id: `${id}-model`, name: modelName }],
        fetchModels: async () => [{ id: `${id}-model`, name: modelName }],
    } as unknown as AparteAIProvider;
}

async function mountSelector(host: HTMLElement): Promise<HTMLElement> {
    const selector = document.createElement('aparte-model-selector');
    host.appendChild(selector);
    document.body.appendChild(host);
    // connectedCallback is async (loads provider models) — wait for options.
    await vi.waitFor(() => {
        expect(selector.querySelector('aparte-option')).toBeTruthy();
    });
    return selector;
}

describe('aparte-model-selector', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        AparteConfig.reset();
    });

    it('registers the custom element', () => {
        expect(customElements.get('aparte-model-selector')).toBeDefined();
    });

    it('renders each provider → model into the dropdown', async () => {
        AparteConfig.registerAIProvider(fakeProvider('gamma', 'Gamma One'));
        const sel = await mountSelector(document.createElement('div'));
        expect(sel.querySelector('aparte-select')).toBeTruthy();
        expect(sel.textContent).toContain('Gamma One');
    });

    it('escapes a hostile remote model name (XSS) instead of injecting it', async () => {
        // A model whose `name` came from a hostile/aggregating /models endpoint.
        AparteConfig.registerAIProvider(fakeProvider('gamma', '<img src=x onerror=alert(1)>'));
        const sel = await mountSelector(document.createElement('div'));

        // No live <img>/<script> element must exist — the payload is inert text.
        expect(sel.querySelector('img')).toBeNull();
        expect(sel.querySelector('script')).toBeNull();
        // The option carries the literal string as its text, not as markup.
        expect(sel.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('emits aparte-model-change on a programmatic selection', async () => {
        AparteConfig.registerAIProvider(fakeProvider('gamma', 'Gamma One'));
        const sel = await mountSelector(document.createElement('div'));

        const detail = await new Promise<AparteModelChangeEventDetail>((res) => {
            sel.addEventListener('aparte-model-change', (e) => {
                res((e as CustomEvent<AparteModelChangeEventDetail>).detail);
            });
            (sel as unknown as { setSelection(p: string, m: string): void })
                .setSelection('gamma', 'gamma-model');
        });

        expect(detail.providerId).toBe('gamma');
        expect(detail.modelId).toBe('gamma-model');
    });

    // ── per-instance config resolution ──────────────────────────────────────

    it('reads providers from the nearest instance config, not the global', async () => {
        const cfgA = new AparteConfigClass();
        const cfgB = new AparteConfigClass();
        cfgA.registerAIProvider(fakeProvider('alpha', 'Alpha One'));
        cfgB.registerAIProvider(fakeProvider('beta', 'Beta One'));

        const hostA = document.createElement('div');
        const hostB = document.createElement('div');
        attachConfig(hostA, cfgA);
        attachConfig(hostB, cfgB);

        const selA = await mountSelector(hostA);
        const selB = await mountSelector(hostB);

        expect(selA.textContent).toContain('Alpha One');
        expect(selA.textContent).not.toContain('Beta One');
        expect(selB.textContent).toContain('Beta One');
        expect(selB.textContent).not.toContain('Alpha One');

        // The global singleton was never touched.
        expect(AparteConfig.getAIProviders()).toHaveLength(0);

        detachConfig(hostA);
        detachConfig(hostB);
    });

    it('persists the selection into ITS config instance only', async () => {
        const cfgA = new AparteConfigClass();
        cfgA.registerAIProvider(fakeProvider('alpha', 'Alpha One'));
        const hostA = document.createElement('div');
        attachConfig(hostA, cfgA);

        const selA = await mountSelector(hostA);
        selA.setAttribute('persist', '');
        (selA as unknown as { setSelection(p: string, m: string): void })
            .setSelection('alpha', 'alpha-model');

        expect(cfgA.getModelConfig().defaultProvider).toBe('alpha');
        expect(cfgA.getModelConfig().defaultModel).toBe('alpha-model');
        // Global stays empty — the write went to the instance.
        expect(AparteConfig.getModelConfig().defaultProvider).toBeUndefined();

        detachConfig(hostA);
    });
});
