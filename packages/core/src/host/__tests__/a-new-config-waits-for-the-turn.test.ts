// @vitest-environment jsdom
/**
 * A chat's `config` can change after it mounted.
 *
 * Every wrapper takes a `config` prop and handed it to the host once, when the host was
 * created: a later one was ignored without a word, so a page that switched a chat to another
 * configuration (another provider, other tools, another language) kept the first. The host
 * now takes a new one — the boundary moves, and every element inside re-resolves — but not in
 * the middle of a turn: a reply half-drawn with one configuration's renderers and finished
 * with another's is worse than a switch that waits for the turn to end.
 */
import { describe, it, expect } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config.js';
import { resolveConfig } from '../../config/config-context.js';
import type { AparteMessage } from '../../types/index.js';

function chat(config?: AparteConfig) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    let messages: AparteMessage[] = [{ id: 'u1', role: 'user', content: 'kept', timestamp: 1 }];
    const binding: AparteChatHostBinding = {
        hostId: 'h-config', host: root, viewport: null,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const host = new AparteChatHost(binding, { config });
    const stop = host.bind();
    const turn = (type: 'aparte-message-start' | 'aparte-message-done') =>
        root.dispatchEvent(new CustomEvent(type, { detail: { messageId: 'r1' } }));
    return { host, root, stop, turn, messages: () => messages };
}

describe('AparteChatHost.setConfig', () => {
    it('moves the chat to the new config, and keeps its messages', () => {
        const first = new AparteConfig();
        const second = new AparteConfig();
        const c = chat(first);
        expect(resolveConfig(c.root)).toBe(first);
        c.host.setConfig(second);
        expect(resolveConfig(c.root)).toBe(second);
        expect(c.messages().map((m) => m.content)).toEqual(['kept']);
        c.stop();
    });

    it('waits for the turn in flight to end', () => {
        const first = new AparteConfig();
        const second = new AparteConfig();
        const c = chat(first);
        c.turn('aparte-message-start');
        c.host.setConfig(second);
        expect(resolveConfig(c.root)).toBe(first);
        c.turn('aparte-message-done');
        expect(resolveConfig(c.root)).toBe(second);
        c.stop();
    });

    it('takes the last config given during the turn, and none given back changes nothing', () => {
        const first = new AparteConfig();
        const second = new AparteConfig();
        const c = chat(first);
        c.turn('aparte-message-start');
        c.host.setConfig(second);
        c.host.setConfig(first);
        c.turn('aparte-message-done');
        expect(resolveConfig(c.root)).toBe(first);
        c.stop();
    });

    it('goes from a config of its own to the page\'s, and back', () => {
        const own = new AparteConfig();
        const c = chat(own);
        c.host.setConfig(undefined);
        expect(resolveConfig(c.root)).toBe(aparteGlobalConfig);
        c.host.setConfig(own);
        expect(resolveConfig(c.root)).toBe(own);
        c.stop();
        // Unbound, the boundary it set is gone.
        expect(resolveConfig(c.root)).toBe(aparteGlobalConfig);
    });
});
