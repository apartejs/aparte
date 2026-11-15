// @vitest-environment jsdom
/**
 * `aparte-conversation-select` with `{ id: null }` starts a new conversation, and its type says so.
 *
 * The list sends a row's id; a New chat button of the app's own sends `{ id: null }` on the same
 * event, and every chat bound to a manager starts a new conversation for it. The detail typed
 * `id: string` made that documented gesture a cast, and a typed listener's "new conversation"
 * branch dead code. The type assertions are checked by `tsc` (`typecheck:tests`); the runtime
 * half pins what `null` does.
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { AparteConversationSelectDetail } from '../aparte-conversation-list.js';
import '../../../types/event-map.js';
import { AparteConversationController, type AparteChatBinding } from '../../../conversations/conversation-controller.js';
import { AparteConversationManager } from '../../../conversations/conversation-manager.js';
import type { AparteConversation, AparteStorageAdapter } from '../../../conversations/types.js';
import type { AparteMessage } from '../../../types/index.js';

describe('AparteConversationSelectDetail', () => {
    it('types `id` as a conversation or `null`, on the window event map too', () => {
        expectTypeOf<AparteConversationSelectDetail['id']>().toEqualTypeOf<string | null>();
        expectTypeOf<WindowEventMap['aparte-conversation-select']['detail']['id']>().toEqualTypeOf<string | null>();
    });

    it('`{ id: null }` sent on window starts a new conversation in the chat it names', async () => {
        const store = new Map<string, AparteConversation>([
            ['c1', { id: 'c1', title: 'one', createdAt: 1, updatedAt: 1, messages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: 1 }] }],
        ]);
        const adapter: AparteStorageAdapter = {
            async loadAll() { return [...store.values()]; },
            async save(c) { store.set(c.id, c); },
            async delete(id) { store.delete(id); },
        };
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const host = document.createElement('div');
        host.id = 'chat';
        document.body.appendChild(host);
        let messages: AparteMessage[] = [];
        const binding: AparteChatBinding = {
            hostId: 'chat', host,
            setMessages: (m) => { messages = [...m]; },
            appendMessage: (m) => { messages = [...messages, m]; },
            getMessages: () => messages,
            clearMessages: () => { messages = []; },
        };
        const controller = new AparteConversationController(binding, { manager });
        const unbind = controller.bind();
        await controller.setConversationId('c1');
        expect(messages).toHaveLength(1);

        window.dispatchEvent(new CustomEvent<AparteConversationSelectDetail>('aparte-conversation-select', {
            detail: { id: null, targetId: 'chat' },
        }));
        await Promise.resolve();
        expect(controller.activeId).toBeNull();
        expect(messages).toEqual([]);
        unbind();
        host.remove();
    });
});
