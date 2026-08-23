// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, AparteConfig, attachConfig, detachConfig } from '@aparte/core';
import type { AparteAIProvider, AparteModelChangeEventDetail } from '@aparte/core';
import './aparte-model-selector.js';

/**
 * A provider whose `/models` answers after `delayMs` — the shape that made the
 * dropdown's order a race. A local server waking up is slow; a CDN is not.
 */
function slowProvider(id: string, modelName: string, delayMs: number): AparteAIProvider {
    return {
        id,
        getMetadata: () => ({ id, name: `Provider ${id}` }),
        getModels: () => [{ id: `${id}-model`, name: modelName }],
        fetchModels: async () => {
            await new Promise((r) => setTimeout(r, delayMs));
            return [{ id: `${id}-model`, name: modelName }];
        },
    } as unknown as AparteAIProvider;
}

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
        aparteGlobalConfig.reset();
    });

    it('registers the custom element', () => {
        expect(customElements.get('aparte-model-selector')).toBeDefined();
    });

    it('renders each provider → model into the dropdown', async () => {
        aparteGlobalConfig.registerAIProvider(fakeProvider('gamma', 'Gamma One'));
        const sel = await mountSelector(document.createElement('div'));
        expect(sel.querySelector('aparte-select')).toBeTruthy();
        expect(sel.textContent).toContain('Gamma One');
    });

    it('escapes a hostile remote model name (XSS) instead of injecting it', async () => {
        // A model whose `name` came from a hostile/aggregating /models endpoint.
        aparteGlobalConfig.registerAIProvider(fakeProvider('gamma', '<img src=x onerror=alert(1)>'));
        const sel = await mountSelector(document.createElement('div'));

        // No live <img>/<script> element must exist — the payload is inert text.
        expect(sel.querySelector('img')).toBeNull();
        expect(sel.querySelector('script')).toBeNull();
        // The option carries the literal string as its text, not as markup.
        expect(sel.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('emits aparte-model-change on a programmatic selection', async () => {
        aparteGlobalConfig.registerAIProvider(fakeProvider('gamma', 'Gamma One'));
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
        const cfgA = new AparteConfig();
        const cfgB = new AparteConfig();
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
        expect(aparteGlobalConfig.getAIProviders()).toHaveLength(0);

        detachConfig(hostA);
        detachConfig(hostB);
    });

    it('persists the selection into ITS config instance only', async () => {
        const cfgA = new AparteConfig();
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
        expect(aparteGlobalConfig.getModelConfig().defaultProvider).toBeUndefined();

        detachConfig(hostA);
    });

    // ─── a re-render must not undo a user's pick ─────────────────────────────
    //
    // Written while chasing a CI flake where the request carried the default model
    // instead of the selected one. It did NOT reproduce it: a render queues
    // `select.value = <captured>`, but that write does not emit a change, so it
    // cannot revert the config. The flake's cause is elsewhere (the lost keyboard
    // highlight, fixed in `aparte-select`).
    //
    // Kept because the invariant is worth holding on its own: whatever a render has
    // queued, the last word belongs to the user's pick.
    describe('a queued re-render vs a fresh selection', () => {
        /** Two providers so the list has more than one option to move between. */
        const twoProviders = (): void => {
            aparteGlobalConfig.registerAIProvider(fakeProvider('alpha', 'Alpha One'));
            aparteGlobalConfig.registerAIProvider(fakeProvider('beta', 'Beta One'));
        };

        /** Drive the select the way a click or Enter does. */
        const selectValue = (sel: HTMLElement, value: string): void => {
            sel.querySelector('aparte-select')?.dispatchEvent(
                new CustomEvent('aparte-select-change', {
                    bubbles: true,
                    detail: { value },
                }),
            );
        };

        // Two macrotask yields rather than a 10ms bet: the render this waits for is
        // scheduled as a macrotask, so ordering is what matters, not elapsed time.
        const flush = async (): Promise<void> => {
            await new Promise((r) => setTimeout(r, 0));
            await new Promise((r) => setTimeout(r, 0));
        };

        it("keeps the model the user picked, even when a render was already in flight", async () => {
            twoProviders();
            const sel = await mountSelector(document.createElement('div'));
            sel.setAttribute('auto-select', '');
            sel.setAttribute('persist', '');
            await flush();

            // A render starts (anything that re-renders: a config change, a new
            // attribute, a refreshed model list)…
            sel.setAttribute('placeholder', 'pick one');
            // …and the user selects the OTHER model before its queued work runs.
            selectValue(sel, 'beta::beta-model');
            await flush();

            expect(aparteGlobalConfig.getModelConfig().defaultModel).toBe('beta-model');
            expect(aparteGlobalConfig.getModelConfig().defaultProvider).toBe('beta');
        });

        it('does not fire a change that puts the previous model back', async () => {
            twoProviders();
            const sel = await mountSelector(document.createElement('div'));
            sel.setAttribute('auto-select', '');
            sel.setAttribute('persist', '');
            await flush();

            const seen: string[] = [];
            sel.addEventListener('aparte-model-change', (e) => {
                seen.push((e as CustomEvent<AparteModelChangeEventDetail>).detail.modelId);
            });

            sel.setAttribute('placeholder', 'pick one');
            selectValue(sel, 'beta::beta-model');
            await flush();

            // Whatever the sequence, the LAST thing anyone hears must be the pick.
            expect(seen.at(-1)).toBe('beta-model');
        });

        it('auto-selects the FIRST registered provider, not the fastest to answer', async () => {
            // The order an app registers providers in is the only lever it has over
            // what `auto-select` lands on. The fetches run in parallel, so filling
            // the list on completion made that lever a race — and the provider most
            // likely to win a race is a cloud endpoint, i.e. the one that costs
            // money. Here the first registered is 30ms slower than the second.
            aparteGlobalConfig.registerAIProvider(
                slowProvider('local', 'Local One', 30),
                fakeProvider('cloud', 'Cloud One'),
            );

            const sel = await mountSelector(document.createElement('div'));
            sel.setAttribute('auto-select', '');
            sel.setAttribute('persist', '');
            await vi.waitFor(() => {
                expect(aparteGlobalConfig.getModelConfig().defaultModel).toBeTruthy();
            });

            expect(aparteGlobalConfig.getModelConfig().defaultProvider).toBe('local');
            expect(aparteGlobalConfig.getModelConfig().defaultModel).toBe('local-model');
        });
    });
});

/**
 * The mount order every wrapper actually produces.
 *
 * `mountSelector` above attaches the boundary FIRST, which is the one ordering no
 * wrapper produces: all four call `AparteChatHost.bind()` — which runs
 * `attachConfig` — from a post-mount hook. So the selector connects, caches the
 * global config, and only then does the instance boundary appear above it. Its two
 * per-instance tests passed over that hole for exactly that reason.
 */
describe('aparte-model-selector — boundary attached AFTER mount (every wrapper)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('serves the instance config providers, not the global ones', async () => {
        aparteGlobalConfig.registerAIProvider(fakeProvider('global', 'Global Model'));

        // 1. the element connects with no boundary above it
        const host = document.createElement('div');
        const selector = await mountSelector(host);
        expect(selector.textContent, 'it starts on the global, correctly').toContain('Global Model');

        // 2. then bind() attaches the instance config
        const instance = new AparteConfig();
        instance.registerAIProvider(fakeProvider('scoped', 'Scoped Model'));
        attachConfig(host, instance);

        await vi.waitFor(() => {
            expect(selector.textContent, 'the chat was given its own providers').toContain('Scoped Model');
        });
        expect(selector.textContent, 'and must not still offer the global ones').not.toContain('Global Model');
    });

    it('stops listening to the config it left behind', async () => {
        aparteGlobalConfig.registerAIProvider(fakeProvider('global', 'Global Model'));
        const host = document.createElement('div');
        const selector = await mountSelector(host);

        const instance = new AparteConfig();
        instance.registerAIProvider(fakeProvider('scoped', 'Scoped Model'));
        attachConfig(host, instance);
        await vi.waitFor(() => expect(selector.textContent).toContain('Scoped Model'));

        // A change on the config it no longer resolves must not reach it.
        aparteGlobalConfig.registerAIProvider(fakeProvider('late', 'Late Global Model'));
        await new Promise((r) => setTimeout(r, 0));
        expect(selector.textContent).not.toContain('Late Global Model');

        detachConfig(host);
    });
});
