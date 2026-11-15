/**
 * Why the Svelte 5 chat keeps its own list of the reports it has not had back, instead of core's
 * `AparteChatHost.takeEcho`.
 *
 * Core recognises an echo by identity: the list it reported, handed back. Under Svelte 5 what
 * comes back is a proxy — of the chat's own list, or of the parent's when it writes the list into
 * a deep `$state` — and a proxy is never the list. Matching on the ids alone, the comparator core
 * could take, swallows a list of the parent's own that has the same ids and other content, given
 * while a report is still on its way back: an edit the parent makes is then dropped. So the chat
 * records, for each report, the values it will come back as (the list, and the proxy the parent
 * stored, read after the callback) and matches on those AND on the ids.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { registerAllComponents, type AparteChatImperativeApi } from '@aparte/core';
import type { AparteMessage } from '../../types.js';
import ControlledHost from './ControlledHost.svelte';

registerAllComponents();
afterEach(() => cleanup());

describe('the Svelte 5 chat, controlled through a deep $state', () => {
    it('applies a list the parent writes with the same ids and other content while a report is on its way back', async () => {
        const { component } = render(ControlledHost);
        const host = component as unknown as { api(): AparteChatImperativeApi; write(next: AparteMessage[]): void };
        const chat = host.api();
        chat.appendMessage({ id: 'u1', role: 'user', content: 'q', timestamp: 1 });
        flushSync();
        await tick();

        // A report goes out, and in the same tick the parent writes its own list: same ids.
        chat.updateMessage('u1', { content: 'edited by the chat' });
        host.write([{ id: 'u1', role: 'user', content: 'edited by the parent', timestamp: 1 }]);
        flushSync();
        await tick();

        expect(chat.getMessages().map((m) => m.content)).toEqual(['edited by the parent']);
    });
});
