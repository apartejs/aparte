/**
 * A client built with `{ config }` answers only the chats that resolve THAT config.
 *
 * `AparteClient` listens on `window`, and its only instance filter was
 * `scopeToTargetId`. With that unset the guard returned `true` for every event and
 * nothing downstream compared the target's resolved config with the client's own —
 * so on a page with two config-scoped clients, ONE send ran two complete agentic
 * turns against two different providers and appended both replies into the single
 * target the event named.
 *
 * The repo's own per-instance showcase constructed exactly that, and its comment
 * asserted the opposite: "One client per config. `{ config }` is what scopes the
 * loop." It scoped what the client READS, never what it ANSWERS.
 *
 * The browser test over the same fixture could not see it either: it asserted the
 * other pane stayed empty, and it did — both replies landed in the pane that asked.
 * An assertion about the wrong pane.
 *
 * Unchanged on purpose: a client on the GLOBAL config still answers everything.
 * That is every single-chat app, and narrowing it would be a silent breaking change
 * for the common case.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config.js';
import { attachConfig } from '../../config/config-context.js';
import { AparteClient } from '../aparte-client.js';
import '../../components/viewport/aparte-chat-viewport.js';

/** A provider that records the sends it was asked to make, and streams nothing. */
function recordingProvider(id: string, calls: string[]) {
    return {
        id,
        getMetadata: () => ({ id, name: id }),
        getModels: () => [{ id: `${id}-model`, name: id, capabilities: ['streaming'] }],
        chat: async () => { calls.push(id); return ''; },
    } as never;
}

/** A chat host with its own config, its own provider and its own client. */
function pane(hostId: string, providerId: string, calls: string[]): AparteConfig {
    const host = document.createElement('div');
    host.id = hostId;
    host.innerHTML = '<aparte-chat-viewport></aparte-chat-viewport>';
    document.body.appendChild(host);

    const config = new AparteConfig();
    config.registerAIProvider(recordingProvider(providerId, calls));
    config.setModelConfig({ defaultProvider: providerId, defaultModel: `${providerId}-model` });
    attachConfig(host, config);

    new AparteClient({ config, autoRegister: false }).start();
    return config;
}

describe('a config-scoped client answers only its own chats', () => {
    let calls: string[];

    beforeEach(() => {
        calls = [];
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('one send reaches ONE provider, not every client on the page', async () => {
        pane('pane-a', 'providerA', calls);
        pane('pane-b', 'providerB', calls);

        document.getElementById('pane-a')!.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'hello', timestamp: Date.now(), targetId: 'pane-a' },
            bubbles: true,
            composed: true,
        }));
        await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
        // A beat, so a second client that WAS going to answer has had its chance.
        await new Promise((r) => setTimeout(r, 0));

        expect(calls, 'only the pane that was addressed may call its provider').toEqual(['providerA']);
    });

    it('the other pane answers its own send, so scoping is not just "the first one wins"', async () => {
        pane('pane-a', 'providerA', calls);
        pane('pane-b', 'providerB', calls);

        document.getElementById('pane-b')!.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'hello', timestamp: Date.now(), targetId: 'pane-b' },
            bubbles: true,
            composed: true,
        }));
        await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
        await new Promise((r) => setTimeout(r, 0));

        expect(calls).toEqual(['providerB']);
    });

    it('a client on the GLOBAL config still answers a chat that has no boundary', async () => {
        const host = document.createElement('div');
        host.id = 'plain';
        host.innerHTML = '<aparte-chat-viewport></aparte-chat-viewport>';
        document.body.appendChild(host);

        aparteGlobalConfig.registerAIProvider(recordingProvider('providerGlobal', calls));
        aparteGlobalConfig.setModelConfig({ defaultProvider: 'providerGlobal', defaultModel: 'providerGlobal-model' });
        new AparteClient({ autoRegister: false }).start();

        host.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'hello', timestamp: Date.now(), targetId: 'plain' },
            bubbles: true,
            composed: true,
        }));
        await vi.waitFor(() => expect(calls).toEqual(['providerGlobal']));
    });
});
