// @vitest-environment jsdom
/**
 * A list names the chat it drives.
 *
 * A row's click said which conversation, never which chat. `aparte-conversation-select`
 * travels to `window`, where every conversation controller of the page hears it: on a page
 * with two chats both opened the conversation, and the chat that did not have it emptied its
 * transcript. And with `manage`, the list looked for the conversation manager where it sits:
 * beside a chat that has a configuration of its own, it found the page's, which has none, and
 * the row menu wrote nothing.
 *
 * `target`, the id of the chat, settles both, as it does for a composer placed outside its chat.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';
import { AparteConfig, aparteGlobalConfig, attachConfig } from '../../../config/index.js';
import type { AparteConversationManager } from '../../../conversations/conversation-manager.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[] };

const ITEMS: AparteConversationListItem[] = [{ id: 'c1', title: 'Leave', updatedAt: Date.now() }];

function mount(attrs: Record<string, string> = {}): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    document.body.appendChild(el);
    el.conversations = ITEMS;
    return el;
}

/** Click a row, and give back what the list told the page. */
function select(el: ListEl): unknown {
    let detail: unknown;
    window.addEventListener('aparte-conversation-select', (e) => { detail = (e as CustomEvent).detail; }, { once: true });
    el.querySelector<HTMLElement>('[data-select-id="c1"]')!.click();
    return detail;
}

/** A chat with a configuration of its own, and the manager registered on it. */
function chatWithItsOwnManager(id: string): { delete: ReturnType<typeof vi.fn> } {
    const chat = document.createElement('div');
    chat.id = id;
    chat.setAttribute('data-aparte-chat', '');
    document.body.appendChild(chat);
    const manager = { delete: vi.fn(async () => undefined) };
    const config = new AparteConfig();
    config.setConversationManager(manager as unknown as AparteConversationManager);
    attachConfig(chat, config);
    return manager;
}

function deleteFromTheMenu(el: ListEl): void {
    el.querySelector<HTMLElement>('[data-conv-id="c1"] .aparte-conv-item__more')!.click();
    el.querySelector<HTMLElement>('[data-menu-action="delete"]')!.click();
    el.querySelector<HTMLElement>('[data-menu-action="confirm-delete"]')!.click();
}

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.setConversationManager(null as unknown as AparteConversationManager);
});

describe('a list names the chat it drives', () => {
    it('says which chat in the select it sends', () => {
        expect(select(mount({ target: 'support' }))).toEqual({ id: 'c1', targetId: 'support' });
    });

    it('says the conversation and nothing else without a target', () => {
        // Strict: a `targetId` that is there and undefined is still a key a host can read.
        expect(select(mount())).toStrictEqual({ id: 'c1' });
    });

    it('reads its target at every click, so it can be named after the list mounted', () => {
        const el = mount();
        el.setAttribute('target', 'support');
        expect(select(el)).toEqual({ id: 'c1', targetId: 'support' });
        el.removeAttribute('target');
        expect(select(el)).toEqual({ id: 'c1' });
    });
});

describe('manage, on a list beside its chat', () => {
    it('acts on the manager of the chat it targets, not on the page\'s', async () => {
        const pages = { delete: vi.fn(async () => undefined) };
        aparteGlobalConfig.setConversationManager(pages as unknown as AparteConversationManager);
        const chats = chatWithItsOwnManager('support');

        deleteFromTheMenu(mount({ target: 'support', manage: '' }));
        await Promise.resolve();

        expect(chats.delete).toHaveBeenCalledWith('c1');
        expect(pages.delete).not.toHaveBeenCalled();
    });

    it('finds the chat it targets inside the shadow root they share', async () => {
        const pages = { delete: vi.fn(async () => undefined) };
        aparteGlobalConfig.setConversationManager(pages as unknown as AparteConversationManager);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        const chat = document.createElement('div');
        chat.id = 'support';
        chat.setAttribute('data-aparte-chat', '');
        const chats = { delete: vi.fn(async () => undefined) };
        const config = new AparteConfig();
        config.setConversationManager(chats as unknown as AparteConversationManager);
        attachConfig(chat, config);
        const el = document.createElement('aparte-conversation-list') as ListEl;
        el.setAttribute('target', 'support');
        el.setAttribute('manage', '');
        root.append(chat, el);
        el.conversations = ITEMS;

        deleteFromTheMenu(el);
        await Promise.resolve();

        expect(chats.delete).toHaveBeenCalledWith('c1');
        expect(pages.delete).not.toHaveBeenCalled();
    });

    it('still finds the manager where it sits when its target names nothing on the page', async () => {
        const pages = { delete: vi.fn(async () => undefined) };
        aparteGlobalConfig.setConversationManager(pages as unknown as AparteConversationManager);

        deleteFromTheMenu(mount({ target: 'not-there', manage: '' }));
        await Promise.resolve();

        expect(pages.delete).toHaveBeenCalledWith('c1');
    });
});
