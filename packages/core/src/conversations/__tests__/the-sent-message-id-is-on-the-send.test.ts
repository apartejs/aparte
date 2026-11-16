// @vitest-environment jsdom
/**
 * The person's message id is on the send.
 *
 * Whoever echoes the message the person sent (the conversation controller, in the
 * capture phase) writes its id on the `aparte-send` detail, beside `echoed`. An app needs
 * it to set a note on that message ("Read by Marie") or to match it with its server's id;
 * without it, it guessed from the last message, which is the AI's pending reply.
 */
import { describe, it, expect } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import type { AparteSendEventDetail } from '../../types/events.js';
import type { AparteMessage } from '../../types/index.js';

describe('the sent message id', () => {
    it('is written on the send detail by the controller that echoes the message', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        let messages: AparteMessage[] = [];
        const b: AparteChatBinding = {
            hostId: 'host', host,
            setMessages: (m) => { messages = m; },
            appendMessage: (m) => { messages.push(m); },
            getMessages: () => messages,
            clearMessages: () => { messages = []; },
            setLoading: () => {},
        };
        const manager = new AparteConversationManager({ loadAll: async () => [], save: async () => {}, delete: async () => {} });
        await manager.init();
        const controller = new AparteConversationController(b, { manager });
        controller.bind();

        let seen: AparteSendEventDetail | undefined;
        host.addEventListener('aparte-send', (e) => { seen = (e as CustomEvent<AparteSendEventDetail>).detail; });
        host.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'hi', timestamp: 1, targetId: 'host' }, bubbles: true }));

        const sent = messages.find((m) => m.role === 'user' && m.content === 'hi');
        expect(sent).toBeDefined();
        expect(seen?.echoed).toBe(true);
        expect(seen?.messageId).toBe(sent!.id);
        controller.unbind?.();
        host.remove();
    });
});
