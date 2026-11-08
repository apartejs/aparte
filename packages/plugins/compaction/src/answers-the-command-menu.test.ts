// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { AparteConfig } from '@aparte/core';
import { setupCompaction } from './compaction.js';

type Added = { id: string; run(context: unknown): Promise<void> };

function ask(config: AparteConfig): Added[] {
    const added: Added[] = [];
    window.dispatchEvent(new CustomEvent('aparte-collect-commands', { detail: { config, add: (c: Added) => added.push(c) } }));
    return added;
}

describe('/compact in the command menu', () => {
    it('is answered for its own config', () => {
        const config = new AparteConfig();
        const compaction = setupCompaction({}, config);
        expect(ask(config).map((c) => c.id)).toEqual(['compact']);
        expect(ask(new AparteConfig())).toEqual([]);
        compaction.dispose();
    });

    it('can be turned off', () => {
        const config = new AparteConfig();
        const compaction = setupCompaction({ commands: false }, config);
        expect(ask(config)).toEqual([]);
        compaction.dispose();
    });

    it('stops answering once disposed', () => {
        const config = new AparteConfig();
        setupCompaction({}, config).dispose();
        expect(ask(config)).toEqual([]);
    });

    it('says why nothing was compacted', async () => {
        const config = new AparteConfig();
        const compaction = setupCompaction({}, config);
        const notify = vi.fn();
        const chat = document.createElement('div');
        Object.assign(chat, { getPath: () => [], setContextSummary: () => {}, getMessages: () => [], updateMessage: () => {} });
        await ask(config)[0]!.run({ chat, targetId: undefined, notify });
        expect(notify.mock.calls).toEqual([['There is nothing to compact yet']]);
        compaction.dispose();
    });
});
