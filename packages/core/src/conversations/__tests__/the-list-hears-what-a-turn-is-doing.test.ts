// @vitest-environment jsdom
/**
 * The conversation list hears what a turn is doing, with no code in the host.
 *
 * The controller is the one piece that knows which conversation a turn belongs to. It
 * tells every list on the page through `aparte-conversation-status` on `window` — the
 * mirror of `aparte-conversation-select`, which the list sends and the controller hears:
 * `running` when a turn starts, `waiting` when a server run pauses on the person,
 * nothing once it ends. Always about the conversation the turn started in, even when the
 * person opened another one meanwhile.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import { AparteConversationManager } from '../conversation-manager.js';
import type { AparteConversation, AparteStorageAdapter } from '../types.js';
import type { AparteMessage } from '../../types/index.js';
import type { AparteConversationStatusDetail } from '../../components/conversation-list/aparte-conversation-list.js';

class MemoryAdapter implements AparteStorageAdapter {
    store = new Map<string, AparteConversation>();
    async loadAll() { return [...this.store.values()]; }
    async save(c: AparteConversation) { this.store.set(c.id, c); }
    async delete(id: string) { this.store.delete(id); }
}

function binding(host: HTMLElement): AparteChatBinding {
    let messages: AparteMessage[] = [];
    return {
        hostId: host.id, host,
        setMessages: (m) => { messages = [...m]; },
        appendMessage: (m) => { messages = [...messages, m as AparteMessage]; },
        getMessages: () => messages,
        clearMessages: () => { messages = []; },
    };
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('the list hears what a turn is doing', () => {
    let host: HTMLElement;
    let manager: AparteConversationManager;
    let heard: AparteConversationStatusDetail[];
    const listen = (e: Event) => heard.push((e as CustomEvent<AparteConversationStatusDetail>).detail);

    beforeEach(async () => {
        document.body.innerHTML = '';
        host = document.createElement('div');
        host.id = 'chat';
        document.body.appendChild(host);
        const adapter = new MemoryAdapter();
        adapter.store.set('a', { id: 'a', title: 'A', createdAt: 1, updatedAt: 1, messages: [] });
        adapter.store.set('b', { id: 'b', title: 'B', createdAt: 1, updatedAt: 2, messages: [] });
        manager = new AparteConversationManager(adapter);
        await manager.init();
        heard = [];
        window.addEventListener('aparte-conversation-status', listen);
    });
    afterEach(() => window.removeEventListener('aparte-conversation-status', listen));

    const fire = (name: string) => host.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: {} }));

    it('running when a turn starts, nothing once it is done', async () => {
        const ctrl = new AparteConversationController(binding(host), { manager });
        ctrl.bind();
        await ctrl.setConversationId('a');
        fire('aparte-message-start');
        expect(heard.at(-1)).toEqual({ id: 'a', status: 'running' });
        fire('aparte-message-done');
        expect(heard.at(-1)).toEqual({ id: 'a', status: null });
    });

    it('nothing after an error or a stop either', async () => {
        const ctrl = new AparteConversationController(binding(host), { manager });
        ctrl.bind();
        await ctrl.setConversationId('a');
        for (const end of ['aparte-message-error', 'aparte-message-aborted']) {
            fire('aparte-message-start');
            fire(end);
            expect(heard.at(-1), end).toEqual({ id: 'a', status: null });
        }
    });

    it('waiting when a server run pauses on the person, running again when it resumes', async () => {
        const ctrl = new AparteConversationController(binding(host), { manager });
        ctrl.bind();
        await ctrl.setConversationId('a');
        fire('aparte-message-start');
        fire('aparte-message-paused');
        expect(heard.at(-1)).toEqual({ id: 'a', status: 'waiting' });
        fire('aparte-message-start');
        expect(heard.at(-1)).toEqual({ id: 'a', status: 'running' });
    });

    it('a turn cut by a switch ends on the conversation it started in', async () => {
        const ctrl = new AparteConversationController(binding(host), { manager });
        ctrl.bind();
        await ctrl.setConversationId('a');
        fire('aparte-message-start');
        await ctrl.setConversationId('b');
        expect(heard).toContainEqual({ id: 'a', status: null });
        expect(heard.some((d) => d.id === 'b')).toBe(false);
    });

    it('a paused turn keeps waiting when the person goes elsewhere: the pause survives the switch', async () => {
        const ctrl = new AparteConversationController(binding(host), { manager });
        ctrl.bind();
        await ctrl.setConversationId('a');
        fire('aparte-message-start');
        fire('aparte-message-paused');
        await ctrl.setConversationId('b');
        expect(heard.at(-1)).toEqual({ id: 'a', status: 'waiting' });
    });

    it('a first message: the conversation is created during the turn, and still hears it', async () => {
        const ctrl = new AparteConversationController(binding(host), { manager });
        ctrl.bind();
        host.dispatchEvent(new CustomEvent('aparte-send', { bubbles: true, detail: { content: 'Plan a weekend', targetId: 'chat' } }));
        fire('aparte-message-start');
        await flush();
        const created = ctrl.activeId;
        expect(created).toBeTruthy();
        expect(heard).toContainEqual({ id: created, status: 'running' });
    });
});
