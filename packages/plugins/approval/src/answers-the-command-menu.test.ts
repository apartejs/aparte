// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { AparteConfig } from '@aparte/core';
import { setupApproval } from './approval.js';

type Row = { id: string; label: string; icon?: string; run(): void };
type Added = { id: string; children: Row[] };

function ask(config: AparteConfig): Added[] {
    const added: Added[] = [];
    window.dispatchEvent(new CustomEvent('aparte-collect-commands', { detail: { config, add: (c: Added) => added.push(c) } }));
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
        children[0]!.run();
        expect(approval.getMode()).toBe('plan');
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
