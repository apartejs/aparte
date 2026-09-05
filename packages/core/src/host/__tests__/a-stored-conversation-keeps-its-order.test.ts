// @vitest-environment jsdom
/**
 * Open a stored conversation under a framework, send a follow-up, leave, come back: the
 * transcript comes back in the order it was written.
 *
 * It did not. The controller hands a stored list to the framework through
 * `binding.setMessages` — the framework's own reactive list, and nothing else. The
 * viewport's repository, which is what `exportTree()` serialises, never heard of those
 * messages, so the follow-up became the ROOT of a brand-new tree; then
 * `syncRepoFromMessages` (which `exportTree` calls first) appended the history it could
 * not find — at the head, i.e. AFTER the new turn. The saved tree read
 * [new turn, old history], and the next open restored exactly that. Vanilla was right
 * all along, because there `setMessages` goes to the viewport, which fills the tree.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteConversationManager } from '../../conversations/conversation-manager.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteMessage } from '../../types/index.js';
// From the module that defines them: the types barrel carries the element/segment
// surface, not the storage contract.
import type { AparteConversation, AparteStorageAdapter } from '../../conversations/types.js';

const message = (id: string, role: AparteMessage['role'], content: string): AparteMessage =>
    ({ id, role, content, timestamp: 1 });

function storedConversations(): AparteConversation[] {
    return [
        {
            id: 'c1', title: 'One', createdAt: 1, updatedAt: 1,
            messages: [message('u1', 'user', 'first'), message('a1', 'assistant', 'answer')],
        },
        { id: 'c2', title: 'Two', createdAt: 2, updatedAt: 2, messages: [] },
    ];
}

async function setup() {
    const rows = storedConversations();
    const adapter: AparteStorageAdapter = {
        async loadAll() { return rows; },
        async save(conv: AparteConversation) {
            const i = rows.findIndex((c) => c.id === conv.id);
            if (i >= 0) rows[i] = conv; else rows.push(conv);
        },
        async delete(id: string) { const i = rows.findIndex((c) => c.id === id); if (i >= 0) rows.splice(i, 1); },
    };
    const config = new AparteConfig();
    const manager = new AparteConversationManager(adapter);
    config.setConversationManager(manager);
    await manager.init();

    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = 'h1';
    const viewport = document.createElement('aparte-chat-viewport');
    viewport.setAttribute('framework-managed', '');
    root.appendChild(viewport);
    document.body.appendChild(root);
    await vi.waitFor(() => expect(typeof (viewport as unknown as { exportTree?: unknown }).exportTree).toBe('function'));

    let messages: AparteMessage[] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h1', host: root, viewport,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const host = new AparteChatHost(binding, { config });
    const teardown = host.bind();
    return { host, root, teardown, rows, ids: () => messages.map((m) => m.id) };
}

const select = (id: string | null): void => {
    window.dispatchEvent(new CustomEvent('aparte-conversation-select', { detail: { id } }));
};

describe('a stored conversation continued under a framework', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('comes back in the order it was written', async () => {
        const { host, root, teardown, ids } = await setup();
        select('c1');
        await vi.waitFor(() => expect(ids()).toEqual(['u1', 'a1']));

        host.appendMessage(message('u2', 'user', 'second'));
        host.appendMessage(message('a2', 'assistant', 'answer again'));
        // What ends a turn — and what makes the controller persist it.
        root.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'a2' }, bubbles: true }));
        await vi.waitFor(() => expect(ids()).toEqual(['u1', 'a1', 'u2', 'a2']));

        select('c2');
        await vi.waitFor(() => expect(ids()).toEqual([]));
        select('c1');
        await vi.waitFor(() => expect(ids()).toEqual(['u1', 'a1', 'u2', 'a2']));
        teardown();
    });
});
