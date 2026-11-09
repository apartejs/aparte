// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { AparteConfig } from '@aparte/core';
import { setupApproval } from './approval.js';

type Row = { id: string; label: string; icon?: string; run(context: { composer: HTMLElement }): void };
type Added = { id: string; children: Row[] };

function ask(config: AparteConfig, composer?: HTMLElement): Added[] {
    const added: Added[] = [];
    window.dispatchEvent(new CustomEvent('aparte-collect-commands', { detail: { config, composer, add: (c: Added) => added.push(c) } }));
    return added;
}

const classify = { read: [], write: [], exec: [] };

describe('/approval in the command menu', () => {
    it('lists the modes, marks the current one, and switches', () => {
        const config = new AparteConfig();
        const approval = setupApproval({ classify, mode: 'ask' }, config);
        const { children } = ask(config)[0]!;
        expect(children.map((c) => c.id)).toEqual(['plan', 'ask', 'auto-edit', 'auto']);
        expect(children.find((c) => c.icon === 'check')!.id).toBe('ask');
        children[0]!.run({ composer: document.createElement('div') });
        expect(approval.getMode()).toBe('plan');
        approval.dispose();
    });

    it('says the switch the way the select does, once', () => {
        const config = new AparteConfig();
        const approval = setupApproval({ classify, mode: 'ask' }, config);
        const composer = document.createElement('div');
        const heard: unknown[] = [];
        composer.addEventListener('aparte-approval-mode-change', (e) => heard.push((e as CustomEvent).detail));
        const { children } = ask(config)[0]!;
        children.find((c) => c.id === 'auto')!.run({ composer });
        children.find((c) => c.id === 'auto')!.run({ composer });
        expect(heard).toEqual([{ mode: 'auto', previousMode: 'ask' }]);
        approval.dispose();
    });

    it('uses the labels the switch was given', () => {
        const config = new AparteConfig();
        const approval = setupApproval({ classify }, config);
        const composer = document.createElement('div');
        const select = composer.appendChild(document.createElement('aparte-approval-mode')) as HTMLElement & { labels: object };
        select.labels = { plan: 'Plan seul' };
        expect(ask(config, composer)[0]!.children[0]!.label).toBe('Plan seul');
        approval.dispose();
    });

    it('leaves another config alone, and can be turned off', () => {
        const config = new AparteConfig();
        const on = setupApproval({ classify }, config);
        expect(ask(new AparteConfig())).toEqual([]);
        on.dispose();
        expect(ask(config)).toEqual([]);
        const off = setupApproval({ classify, commands: false }, config);
        expect(ask(config)).toEqual([]);
        off.dispose();
    });
});
