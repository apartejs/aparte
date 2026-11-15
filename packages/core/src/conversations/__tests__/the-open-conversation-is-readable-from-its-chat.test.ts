// @vitest-environment jsdom
/**
 * Which conversation a chat has open, read from outside the chat.
 *
 * `AparteClient` sits beside a chat, not in it, so it cannot ask the conversation controller
 * directly. The controller leaves a reader on the chat's element, and the client climbs to it
 * from the element it renders into. These are the rules that climb relies on: what answers,
 * for whom, and what a teardown takes away.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { offerOpenConversation, openConversationOf } from '../open-conversation.js';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import { AparteConversationManager } from '../conversation-manager.js';

afterEach(() => { document.body.innerHTML = ''; });

function chat(html = '<div class="transcript"><span class="bubble"></span></div>') {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return { host, inside: host.querySelector('.bubble') as HTMLElement };
}

describe('the conversation open in a chat', () => {
    it('is read from the chat\'s element, or from anything inside it', () => {
        const { host, inside } = chat();
        const outside = document.createElement('div');
        document.body.appendChild(outside);
        offerOpenConversation(host, () => 'c1');
        expect(openConversationOf(host)).toBe('c1');
        expect(openConversationOf(inside)).toBe('c1');
        expect(openConversationOf(outside)).toBeNull();
    });

    it('is the answer for now: the reader is asked again at each question', () => {
        const { host } = chat();
        let open: string | null = 'a';
        offerOpenConversation(host, () => open);
        expect(openConversationOf(host)).toBe('a');
        open = 'b';
        expect(openConversationOf(host)).toBe('b');
        open = null;
        expect(openConversationOf(host)).toBeNull();
    });

    it('is the nearest chat\'s when one chat sits inside another', () => {
        const { host, inside } = chat('<div class="inner"><span class="bubble"></span></div>');
        const inner = host.querySelector('.inner') as HTMLElement;
        offerOpenConversation(host, () => 'outer');
        offerOpenConversation(inner, () => 'inner');
        expect(openConversationOf(inside)).toBe('inner');
        expect(openConversationOf(host)).toBe('outer');
    });

    it('is nothing for what is not an element, or an element nothing manages', () => {
        expect(openConversationOf(null)).toBeNull();
        expect(openConversationOf(undefined)).toBeNull();
        // A mock a test hands the client as its target: no `parentElement`, no reader.
        expect(openConversationOf({ appendMessage() {} } as unknown as Element)).toBeNull();
        expect(openConversationOf(chat().inside)).toBeNull();
    });

    it('is taken off by the teardown of the reader that was left, and only by that one', () => {
        const { host } = chat();
        const withdrawFirst = offerOpenConversation(host, () => 'first');
        const withdrawSecond = offerOpenConversation(host, () => 'second');
        // A controller a framework has already replaced on the same element is torn down late.
        withdrawFirst();
        expect(openConversationOf(host)).toBe('second');
        withdrawSecond();
        expect(openConversationOf(host)).toBeNull();
    });
});

describe('a conversation controller leaves its chat readable while it is bound', () => {
    const bindingOn = (host: HTMLElement): AparteChatBinding => ({
        hostId: 'host', host,
        setMessages: () => {},
        appendMessage: () => {},
        getMessages: () => [],
        clearMessages: () => {},
    });

    it('says the conversation it has open, and nothing once it is unbound', async () => {
        const { host, inside } = chat();
        const manager = new AparteConversationManager({
            loadAll: async () => [{ id: 'a', title: 'a', createdAt: 1, updatedAt: 1, messages: [] }],
            save: async () => {},
            delete: async () => {},
        });
        await manager.init();
        const controller = new AparteConversationController(bindingOn(host), { manager });

        expect(openConversationOf(inside)).toBeNull();
        controller.bind();
        expect(openConversationOf(inside)).toBeNull();
        await controller.setConversationId('a');
        expect(openConversationOf(inside)).toBe('a');
        await controller.setConversationId(null);
        expect(openConversationOf(inside)).toBeNull();

        await controller.setConversationId('a');
        controller.unbind();
        expect(openConversationOf(inside)).toBeNull();
    });

    it('is bound again by a framework that unbinds and binds in turn', async () => {
        const { host } = chat();
        const manager = new AparteConversationManager({
            loadAll: async () => [{ id: 'a', title: 'a', createdAt: 1, updatedAt: 1, messages: [] }],
            save: async () => {},
            delete: async () => {},
        });
        await manager.init();
        const first = new AparteConversationController(bindingOn(host), { manager });
        first.bind();
        await first.setConversationId('a');
        first.unbind();

        const second = new AparteConversationController(bindingOn(host), { manager });
        second.bind();
        await second.setConversationId('a');
        expect(openConversationOf(host)).toBe('a');
        second.unbind();
    });
});
