// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '@aparte/core';
import '../aparte-model-selector.js';
import type { AparteModelSelector } from '../aparte-model-selector.js';

type Row = { id: string; label: string; icon?: string; run?(): void; children?: Row[] };
type Added = { id: string; children: Row[] };

function ask(config: AparteConfig): Added[] {
    const added: Added[] = [];
    window.dispatchEvent(new CustomEvent('aparte-collect-commands', { detail: { config, add: (c: Added) => added.push(c) } }));
    return added;
}

function provider(id: string, models: string[]): never {
    return { id, getMetadata: () => ({ id, name: id.toUpperCase() }), getModels: () => models.map((m) => ({ id: m, name: m })) } as never;
}

async function mount(attrs: Record<string, string> = {}): Promise<AparteModelSelector> {
    const el = document.createElement('aparte-model-selector') as AparteModelSelector;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    return el;
}

describe('/model in the command menu', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('lists the models of a single provider and picks one', async () => {
        aparteGlobalConfig.registerAIProvider(provider('a', ['m1', 'm2']));
        const el = await mount();
        const rows = ask(aparteGlobalConfig)[0]!.children;
        expect(rows.map((r) => r.label)).toEqual(['m1', 'm2']);
        rows[1]!.run!();
        expect(el.modelId).toBe('m2');
    });

    it('goes through the providers when there are several', async () => {
        aparteGlobalConfig.registerAIProvider(provider('a', ['m1']));
        aparteGlobalConfig.registerAIProvider(provider('b', ['m2']));
        await mount();
        const rows = ask(aparteGlobalConfig)[0]!.children;
        expect(rows.map((r) => r.label)).toEqual(['A', 'B']);
        expect(rows[1]!.children![0]!.label).toBe('m2');
    });

    it('marks the current one', async () => {
        aparteGlobalConfig.registerAIProvider(provider('a', ['m1', 'm2']));
        const el = await mount();
        el.setSelection('a', 'm2');
        expect(ask(aparteGlobalConfig)[0]!.children.find((r) => r.icon === 'check')!.label).toBe('m2');
    });

    it('stays out when asked to, and once removed', async () => {
        aparteGlobalConfig.registerAIProvider(provider('a', ['m1']));
        const off = await mount({ commands: 'false' });
        expect(ask(aparteGlobalConfig)).toEqual([]);
        off.remove();
        const on = await mount();
        expect(ask(aparteGlobalConfig)).toHaveLength(1);
        on.remove();
        expect(ask(aparteGlobalConfig)).toEqual([]);
    });
});
