// @vitest-environment jsdom
/**
 * Opening a provider's group fetches its models again: a list that changes on the server (a
 * model pulled into a local runtime) shows when the reader looks, not only at mount. The group
 * says it is loading meanwhile; a failed fetch keeps what was there (the config warns);
 * closing the group fetches nothing.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, createModelCatalogue, type AparteAIProvider } from '@aparte/core';
import '../aparte-model-selector.js';

function provider(id: string, lists: Array<Array<{ id: string; name: string }> | Error>): AparteAIProvider {
    let call = 0;
    return {
        id,
        getMetadata: () => ({ id, name: `Provider ${id}` }),
        getModels: () => [],
        fetchModels: async () => {
            const next = lists[Math.min(call++, lists.length - 1)]!;
            if (next instanceof Error) throw next;
            return next;
        },
    } as unknown as AparteAIProvider;
}

async function mount(): Promise<HTMLElement> {
    const selector = document.createElement('aparte-model-selector');
    document.body.appendChild(selector);
    await vi.waitFor(() => expect(selector.querySelectorAll('aparte-optgroup')).toHaveLength(2));
    return selector;
}

const toggle = (selector: HTMLElement, label: string, collapsed: boolean): HTMLElement => {
    const group = [...selector.querySelectorAll<HTMLElement>('aparte-optgroup')].find((g) => g.getAttribute('label') === label)!;
    group.dispatchEvent(new CustomEvent('aparte-optgroup-toggle', { bubbles: true, detail: { label, collapsed } }));
    return group;
};
const optionValues = (selector: HTMLElement): string[] =>
    [...selector.querySelectorAll('aparte-option')].map((o) => o.getAttribute('value') ?? '');

describe("a provider's group, opened", () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
        vi.restoreAllMocks();
    });

    it('fetches its models again and shows the new one, loading meanwhile', async () => {
        aparteGlobalConfig.registerAIProvider(
            provider('local', [[{ id: 'small', name: 'Small' }], [{ id: 'small', name: 'Small' }, { id: 'pulled', name: 'Just pulled' }]]),
            provider('cloud', [[{ id: 'big', name: 'Big' }]]),
        );
        const selector = await mount();
        expect(optionValues(selector)).not.toContain('local::pulled');

        const group = toggle(selector, 'Provider local', false);
        expect(group.hasAttribute('loading') || (group as HTMLElement & { loading?: boolean }).loading).toBeTruthy();

        await vi.waitFor(() => expect(optionValues(selector)).toContain('local::pulled'));
        const after = [...selector.querySelectorAll<HTMLElement & { loading?: boolean }>('aparte-optgroup')].find((g) => g.getAttribute('label') === 'Provider local')!;
        expect(after.loading ?? after.hasAttribute('loading')).toBeFalsy();
    });

    it('keeps what it showed when the fetch fails, and says so at the console', async () => {
        // The config's refresh catches the failure and warns; the selector keeps its list.
        const error = vi.spyOn(console, 'warn').mockImplementation(() => {});
        aparteGlobalConfig.registerAIProvider(
            provider('local', [[{ id: 'small', name: 'Small' }], new Error('offline')]),
            provider('cloud', [[{ id: 'big', name: 'Big' }]]),
        );
        const selector = await mount();
        toggle(selector, 'Provider local', false);
        await vi.waitFor(() => expect(error).toHaveBeenCalled());
        expect(optionValues(selector)).toContain('local::small');
    });

    it("of a provider with a fixed list, fetches nothing: its list is the one it was given", async () => {
        const fixed = createModelCatalogue({ id: 'server', name: 'Provider server', models: [{ id: 'a', name: 'A' }] });
        const models = vi.spyOn(fixed, 'getModels');
        aparteGlobalConfig.registerAIProvider(fixed, provider('cloud', [[{ id: 'big', name: 'Big' }]]));
        const selector = await mount();
        const before = models.mock.calls.length;
        toggle(selector, 'Provider server', false);
        await new Promise((r) => setTimeout(r, 20));
        expect(models.mock.calls.length).toBe(before);
        expect(optionValues(selector)).toContain('server::a');
    });

    it('fetches nothing when it closes', async () => {
        const local = provider('local', [[{ id: 'small', name: 'Small' }]]);
        const fetch = vi.spyOn(local, 'fetchModels' as never);
        aparteGlobalConfig.registerAIProvider(local, provider('cloud', [[{ id: 'big', name: 'Big' }]]));
        const selector = await mount();
        const before = fetch.mock.calls.length;
        toggle(selector, 'Provider local', true);
        await new Promise((r) => setTimeout(r, 20));
        expect(fetch.mock.calls.length).toBe(before);
    });
});

describe('the list a selector loads', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
        vi.restoreAllMocks();
    });

    it("shows only the models the config's modelFilters keep for a provider", async () => {
        aparteGlobalConfig.registerAIProvider(
            provider('local', [[{ id: 'small', name: 'Small' }, { id: 'huge', name: 'Huge' }]]),
            provider('cloud', [[{ id: 'big', name: 'Big' }]]),
        );
        aparteGlobalConfig.setModelConfig({ modelFilters: { local: ['small'] } });
        const selector = await mount();
        expect(optionValues(selector)).toEqual(expect.arrayContaining(['local::small', 'cloud::big']));
        expect(optionValues(selector)).not.toContain('local::huge');
    });

    it('leaves out a provider whose list cannot be read, and lists the others', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const broken = {
            id: 'broken',
            getMetadata: () => ({ id: 'broken', name: 'Provider broken' }),
            getModels: () => { throw new Error('no list'); },
        } as unknown as AparteAIProvider;
        aparteGlobalConfig.registerAIProvider(
            broken,
            provider('local', [[{ id: 'small', name: 'Small' }]]),
            provider('cloud', [[{ id: 'big', name: 'Big' }]]),
        );
        const selector = await mount();
        expect(optionValues(selector)).toEqual(expect.arrayContaining(['local::small', 'cloud::big']));
        expect(selector.querySelector('aparte-optgroup[label="Provider broken"]')).toBeNull();
        expect(warn).toHaveBeenCalled();
    });
});
