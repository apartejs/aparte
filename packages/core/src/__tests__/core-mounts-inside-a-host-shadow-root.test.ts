// @vitest-environment jsdom
/**
 * A chat mounted inside a shadow root of the consumer's own — their web component,
 * their micro-frontend — is a documented arrangement: the stylesheet declares its
 * tokens on `:host` for exactly that case. Four of core's handlers listen on
 * `document`, and an event that crosses a shadow boundary is RETARGETED there:
 * `event.target` reads as the shadow host, not the node that was hit. Each of the
 * four asked "is this inside me?" of the host, got no, and did the wrong thing —
 * a row menu that closed on the press, a sidebar toggle and a pane switch that did
 * nothing, a select that shut itself the instant it opened.
 *
 * Two lookups read the wrong tree the same way: a control that names no element
 * resolves the one beside it, which `document.querySelector` cannot see inside a
 * shadow root, and `document.activeElement` retargets to the host exactly as
 * `event.target` does — which the drawer's Tab trap and the select's filter field
 * both ask.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import '../components/conversation-list/aparte-conversation-list.js';
import '../components/sidebar/aparte-sidebar.js';
import '../components/split/aparte-split.js';
import '../primitives/select/aparte-select.js';
import '../primitives/select/aparte-option.js';
import type { AparteConversationListItem } from '../components/conversation-list/aparte-conversation-list.js';
import { AparteClient } from '../client/aparte-client.js';
import type { AparteClientOptions } from '../client/aparte-client.js';
import { AparteConfig } from '../config/index.js';
import type { AparteMessage } from '../types/index.js';

/** A host element with an open shadow root, connected to the document. */
function shadowHost(): ShadowRoot {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host.attachShadow({ mode: 'open' });
}

/** What a real click is: composed, so it crosses the boundary and reaches `document`. */
const clickIt = (el: Element): void => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
};

afterEach(() => { document.body.innerHTML = ''; });

/** The drawer's media query, driven by hand: jsdom's own never matches. */
type MediaListener = (e: { matches: boolean }) => void;
let mediaMatches = false;
let mediaListeners: MediaListener[] = [];
beforeEach(() => {
    mediaMatches = false;
    mediaListeners = [];
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
        get matches() { return mediaMatches; },
        addEventListener: (_: string, cb: MediaListener) => { mediaListeners.push(cb); },
        removeEventListener: (_: string, cb: MediaListener) => { mediaListeners = mediaListeners.filter((l) => l !== cb); },
    });
});
const narrow = (matches: boolean): void => {
    mediaMatches = matches;
    for (const cb of mediaListeners) cb({ matches });
};

/** A composed keydown, the way a real key press crosses the boundary. */
const press = (target: Element, key: string, shiftKey = false): boolean =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, composed: true, cancelable: true }));


describe('core inside a host shadow root', () => {
    it('keeps a conversation row menu open while it is being used', () => {
        const root = shadowHost();
        const list = document.createElement('aparte-conversation-list') as HTMLElement & {
            conversations: AparteConversationListItem[];
        };
        root.appendChild(list);
        list.conversations = [{ id: 'c1', title: 'One' }];

        list.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        const menu = list.querySelector<HTMLElement>('[role="menu"]')!;
        menu.querySelector<HTMLElement>('[data-menu-action="rename"]')!
            .dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));

        expect(list.querySelector('[role="menu"]')).not.toBeNull();
    });

    it('honours a sidebar toggle button', () => {
        const root = shadowHost();
        const sidebar = document.createElement('aparte-sidebar') as HTMLElement & { collapsed: boolean };
        sidebar.id = 'shadow-sidebar';
        root.appendChild(sidebar);
        const toggle = document.createElement('button');
        toggle.setAttribute('data-aparte-sidebar-toggle', 'shadow-sidebar');
        root.appendChild(toggle);
        const before = sidebar.collapsed;

        clickIt(toggle);

        expect(sidebar.collapsed).toBe(!before);
    });

    it('honours a split pane button', () => {
        const root = shadowHost();
        const split = document.createElement('aparte-split') as HTMLElement & { pane: 'start' | 'end' };
        split.id = 'shadow-split';
        root.appendChild(split);
        const button = document.createElement('button');
        button.setAttribute('data-aparte-split-pane', 'shadow-split');
        root.appendChild(button);

        clickIt(button);

        expect(split.pane).toBe('end');
    });

    it('lets a select open on its own trigger', () => {
        const root = shadowHost();
        const select = document.createElement('aparte-select');
        select.setAttribute('placeholder', 'Pick');
        const option = document.createElement('aparte-option');
        option.setAttribute('value', 'a');
        option.textContent = 'a';
        select.appendChild(option);
        root.appendChild(select);

        clickIt(select.querySelector('.aparte-select-trigger')!);

        expect(select.hasAttribute('open')).toBe(true);
    });

    it('still closes that select on a click elsewhere in the shadow tree', () => {
        const root = shadowHost();
        const select = document.createElement('aparte-select');
        select.setAttribute('placeholder', 'Pick');
        root.appendChild(select);
        const elsewhere = document.createElement('button');
        root.appendChild(elsewhere);
        clickIt(select.querySelector('.aparte-select-trigger')!);

        clickIt(elsewhere);

        expect(select.hasAttribute('open')).toBe(false);
    });
});

describe('a control that names no element finds the one in its own tree', () => {
    it('toggles the sidebar beside it, not the one in the document', () => {
        const light = document.createElement('aparte-sidebar') as HTMLElement & { collapsed: boolean };
        document.body.appendChild(light);
        const root = shadowHost();
        const toggle = document.createElement('button');
        toggle.setAttribute('data-aparte-sidebar-toggle', '');
        root.appendChild(toggle);
        const sidebar = document.createElement('aparte-sidebar') as HTMLElement & { collapsed: boolean };
        root.appendChild(sidebar);

        expect(toggle.getAttribute('aria-controls'), 'the toggle announces the sidebar in its own tree').toBe(sidebar.id);

        clickIt(toggle);

        expect(sidebar.collapsed).toBe(true);
        expect(light.collapsed, 'a sidebar in the document must not answer a control from another tree').toBe(false);
    });

    it('switches the split beside it, not the one in the document', () => {
        const light = document.createElement('aparte-split') as HTMLElement & { pane: 'start' | 'end' };
        document.body.appendChild(light);
        const root = shadowHost();
        const split = document.createElement('aparte-split') as HTMLElement & { pane: 'start' | 'end' };
        root.appendChild(split);
        const button = document.createElement('button');
        button.setAttribute('data-aparte-split-pane', 'end');
        root.appendChild(button);

        clickIt(button);

        expect(split.pane).toBe('end');
        expect(light.pane, 'a split in the document must not answer a button from another tree').toBe('start');
    });
});

describe('the focus reads from the tree it is in', () => {
    it('keeps Shift+Tab inside a drawer', () => {
        const root = shadowHost();
        const sidebar = document.createElement('aparte-sidebar') as HTMLElement & { collapsed: boolean; open(): void };
        sidebar.innerHTML = '<button type="button" id="first">New chat</button>'
            + '<button type="button" id="last">Settings</button>';
        root.appendChild(sidebar);
        narrow(true);
        sidebar.open();
        expect(sidebar.collapsed).toBe(false);
        const first = sidebar.querySelector<HTMLElement>('#first')!;
        const last = sidebar.querySelector<HTMLElement>('#last')!;

        first.focus();
        const notPrevented = press(first, 'Tab', true);

        expect(notPrevented, 'Shift+Tab at the first control must be handled').toBe(false);
        expect(root.activeElement, 'Shift+Tab wraps to the last control, not back to the first').toBe(last);
    });

    it('leaves Home to the caret in a searchable select', () => {
        const root = shadowHost();
        const select = document.createElement('aparte-select');
        select.setAttribute('placeholder', 'Pick');
        select.setAttribute('searchable', '');
        for (const value of ['a', 'b']) {
            const option = document.createElement('aparte-option');
            option.setAttribute('value', value);
            option.textContent = value;
            select.appendChild(option);
        }
        root.appendChild(select);
        clickIt(select.querySelector('.aparte-select-trigger')!);
        const search = select.querySelector<HTMLInputElement>('.aparte-select-search')!;
        search.focus();

        const notPrevented = press(search, 'Home');

        expect(notPrevented, 'Home in the filter field moves the caret; it does not jump the list').toBe(true);
    });
});

/**
 * The send is the primary function, and it resolves its chat by LOOKUP: the id the
 * composer names, then the walk up from the event, then a scan of the page. All three
 * read the document, which cannot see into a shadow tree — so a chat mounted in one
 * was answered by whatever chat the document happened to hold, and the person's own
 * transcript stayed empty. Retry and edit share the resolver, so they went the same way.
 */
describe('a chat inside a host shadow root answers its own send', () => {
    /** What the client renders into: the shell carries the id, its viewport renders. */
    interface FakeChat {
        chat: HTMLElement;
        composer: HTMLElement;
        messages: AparteMessage[];
        siblings: string[];
    }

    function mountChat(root: ParentNode, id: string): FakeChat {
        const messages: AparteMessage[] = [];
        const siblings: string[] = [];
        const viewport = document.createElement('aparte-chat-viewport');
        Object.assign(viewport as unknown as Record<string, unknown>, {
            appendMessage: (m: AparteMessage) => { messages.push(m); },
            getMessages: () => [...messages],
            updateMessage: (messageId: string, patch: Partial<AparteMessage>) => {
                const found = messages.find((m) => m.id === messageId);
                if (found) Object.assign(found, patch);
            },
            addSiblingOf: (of: string, m: AparteMessage) => { siblings.push(of); messages.push(m); return m.id; },
            truncateResponsesAfter: () => {},
            addSegment: () => {},
            updateSegment: () => {},
            setUsage: () => {},
        });
        const chat = document.createElement('aparte-chat');
        chat.id = id;
        Object.defineProperty(chat, 'viewport', { value: viewport });
        chat.appendChild(viewport);
        // Stands for the composer: the node the gesture starts from.
        const composer = document.createElement('div');
        chat.appendChild(composer);
        root.appendChild(chat);
        return { chat, composer, messages, siblings };
    }

    const started: AparteClient[] = [];
    function startClient(options: Partial<AparteClientOptions> = {}): void {
        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }],
        } as never);
        cfg.setKeyProvider(() => 'k');
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setTransport({
            chat: () => new ReadableStream({
                start(controller) { controller.enqueue({ type: 'done' }); controller.close(); },
            }),
        } as never);
        const client = new AparteClient({ config: cfg, autoRegister: false, ...options });
        client.start();
        started.push(client);
    }

    /** What `<aparte-composer>` dispatches: composed, so it reaches the window listener. */
    const send = (from: Element, targetId: string | undefined, content: string): void => {
        from.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content, timestamp: 1, ...(targetId ? { targetId } : {}) },
            bubbles: true, composed: true,
        }));
    };
    const ask = (from: Element, type: string, detail: Record<string, unknown>): void => {
        from.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    };

    afterEach(() => { for (const client of started.splice(0)) client.stop(); });

    it('appends the user message and the reply in its own chat, not the one in the document', async () => {
        const light = mountChat(document.body, 'light-chat');
        const root = shadowHost();
        const shadow = mountChat(root, 'shadow-chat');
        startClient();

        send(shadow.composer, 'shadow-chat', 'hello');

        await vi.waitFor(() => expect(shadow.messages.length).toBeGreaterThanOrEqual(2));
        expect(shadow.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
        expect(light.messages, 'a chat in the document must not answer a send from another tree').toEqual([]);
    });

    it('finds the chat it came from even when the send names no target', async () => {
        const light = mountChat(document.body, 'light-chat');
        const root = shadowHost();
        const shadow = mountChat(root, 'shadow-chat');
        startClient();

        send(shadow.composer, undefined, 'hello');

        await vi.waitFor(() => expect(shadow.messages.length).toBeGreaterThanOrEqual(2));
        expect(light.messages, 'the scan must not answer with the chat in the document').toEqual([]);
    });

    it('takes a targetResolver that returns the <aparte-chat> shell in your root', async () => {
        const light = mountChat(document.body, 'light-chat');
        const root = shadowHost();
        const shadow = mountChat(root, 'shadow-chat');
        startClient({ targetResolver: () => root.querySelector<HTMLElement>('aparte-chat') });

        send(shadow.composer, undefined, 'hello');

        await vi.waitFor(() => expect(shadow.messages.length).toBeGreaterThanOrEqual(2));
        expect(light.messages, 'the documented escape hatch must reach the shell it names').toEqual([]);
    });

    it('retries and edits in its own tree', async () => {
        const light = mountChat(document.body, 'light-chat');
        const root = shadowHost();
        const shadow = mountChat(root, 'shadow-chat');
        for (const chat of [light, shadow]) {
            chat.messages.push({ id: 'u1', role: 'user', content: 'first', timestamp: 1 });
            chat.messages.push({ id: 'a1', role: 'assistant', content: 'answer', timestamp: 2 });
        }
        startClient();

        ask(shadow.composer, 'aparte-retry', { messageId: 'a1', targetId: 'shadow-chat' });
        await vi.waitFor(() => expect(shadow.siblings).toEqual(['a1']));
        expect(light.siblings, 'the retry must not regenerate the other chat').toEqual([]);

        ask(shadow.composer, 'aparte-edit', { messageId: 'u1', content: 'reworded', targetId: 'shadow-chat' });
        await vi.waitFor(() => expect(shadow.messages[0]?.content).toBe('reworded'));
        expect(light.messages[0]?.content, 'the edit must not rewrite the other chat').toBe('first');
    });
});

/**
 * `document.activeElement` retargets to the shadow HOST exactly as `event.target` does,
 * so "which item is focused?" answers -1 for every item in the menu. The arrows then
 * walked from nowhere — `pin` was unreachable by keyboard — and the focus a re-render
 * puts back was never held at all.
 */
describe('the keyboard keeps its place inside a shadow root', () => {
    const listIn = (root: ParentNode, items: AparteConversationListItem[]): HTMLElement & {
        conversations: AparteConversationListItem[];
    } => {
        const list = document.createElement('aparte-conversation-list') as HTMLElement & {
            conversations: AparteConversationListItem[];
        };
        root.appendChild(list);
        list.conversations = items;
        return list;
    };

    it('walks the row menu with the arrows', () => {
        const root = shadowHost();
        const list = listIn(root, [{ id: 'c1', title: 'One' }]);
        list.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        const items = Array.from(list.querySelectorAll<HTMLElement>('[role="menuitem"]'));
        expect(items.length).toBe(4);
        expect(root.activeElement, 'the menu opens on its first item').toBe(items[0]);

        press(root.activeElement!, 'ArrowDown');
        expect(root.activeElement, 'ArrowDown moves to the next item').toBe(items[1]);
        press(root.activeElement!, 'ArrowUp');
        press(root.activeElement!, 'ArrowUp');
        expect(root.activeElement, 'ArrowUp wraps from the first to the last').toBe(items[3]);
    });

    it('puts the keyboard back on the row after a re-render', () => {
        const root = shadowHost();
        const list = listIn(root, [{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }]);
        list.querySelector<HTMLElement>('[data-select-id="c2"]')!.focus();

        list.conversations = [{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }];

        expect(root.activeElement, 'the row the reader was on comes back focused')
            .toBe(list.querySelector('[data-select-id="c2"]'));
    });
});
