/**
 * The site around the chat: the conversation list, the header title, the new-chat
 * button and the theme toggle.
 *
 * Everything here is UI wiring over what core ships — the list is
 * `<aparte-conversation-list>`, the drawer and the search are `<aparte-sidebar>`'s, the
 * grid is the `.aparte-app-shell` recipe. What this file adds is the glue a real site
 * has: which conversation is open, what the header says, and what a send does to the
 * list. The conversations themselves are sample data (sample-conversations.ts); a site
 * with a store plugs the conversation manager in here instead.
 */
import type { AparteChatViewport, AparteConversationList } from '@aparte/core';
import { moonIcon, sunIcon } from '@aparte/core/icons';
import { SAMPLE_CONVERSATIONS, type SampleConversation } from './sample-conversations';

const NEW_TITLE = 'New conversation';

export function wireShell(): void {
    const list = document.querySelector<AparteConversationList>('aparte-conversation-list');
    const viewport = document.querySelector<AparteChatViewport>('aparte-chat-viewport');
    const chat = document.querySelector<HTMLElement>('aparte-chat');
    const title = document.getElementById('chat-title');
    const welcome = document.getElementById('welcome');
    if (!list || !viewport || !chat || !title) return;

    // Copies, so a rename or a delete in this session never touches the sample data.
    const conversations: SampleConversation[] = SAMPLE_CONVERSATIONS.map((c) => ({ ...c }));
    let activeId: string | null = null;

    const byId = (id: string) => conversations.find((c) => c.id === id);

    /** The list reads a plain item per conversation; the messages stay here. */
    const render = (): void => {
        list.conversations = conversations.map(({ messages: _m, ...item }) => item);
        if (activeId) list.setAttribute('active-id', activeId);
        else list.removeAttribute('active-id');
    };

    /** Open a conversation in the chat — or none, which is the new-chat state. */
    const open = (conv: SampleConversation | null): void => {
        activeId = conv?.id ?? null;
        // `setMessages` replaces the transcript; the messages are historical, so they
        // land without the arrival animation and the composer keeps its focus.
        viewport.setMessages(conv?.messages ?? []);
        title.textContent = conv?.title ?? NEW_TITLE;
        if (welcome) welcome.hidden = (conv?.messages.length ?? 0) > 0;
        render();
    };

    list.addEventListener('aparte-conversation-select', (e) => {
        open(byId((e as CustomEvent<{ id: string }>).detail.id) ?? null);
    });
    list.addEventListener('aparte-conversation-delete', (e) => {
        const id = (e as CustomEvent<{ id: string }>).detail.id;
        const i = conversations.findIndex((c) => c.id === id);
        if (i >= 0) conversations.splice(i, 1);
        if (activeId === id) open(null);
        else render();
    });
    list.addEventListener('aparte-conversation-rename', (e) => {
        const { id, title: next } = (e as CustomEvent<{ id: string; title: string }>).detail;
        const conv = byId(id);
        if (!conv) return;
        conv.title = next;
        if (activeId === id) title.textContent = next;
        render();
    });
    list.addEventListener('aparte-conversation-pin', (e) => {
        const conv = byId((e as CustomEvent<{ id: string }>).detail.id);
        if (conv) { conv.pinnedAt = Date.now(); render(); }
    });
    list.addEventListener('aparte-conversation-unpin', (e) => {
        const conv = byId((e as CustomEvent<{ id: string }>).detail.id);
        if (conv) { delete conv.pinnedAt; render(); }
    });

    document.getElementById('new-chat')?.addEventListener('click', () => {
        open(null);
        chat.querySelector<HTMLElement>('aparte-composer-input')?.focus();
    });

    // A send in the new-chat state creates the conversation, titled by the message —
    // the way a site with a store does through the conversation manager. A send in an
    // open conversation bumps it to the top of its day.
    chat.addEventListener('aparte-send', (e) => {
        const text = String((e as CustomEvent<{ content?: string }>).detail?.content ?? '').trim();
        if (!activeId) {
            const conv: SampleConversation = {
                id: `c-${Date.now().toString(36)}`,
                title: text.length > 60 ? `${text.slice(0, 57)}…` : text || NEW_TITLE,
                updatedAt: Date.now(),
                messages: [],
            };
            conversations.unshift(conv);
            activeId = conv.id;
            title.textContent = conv.title;
        } else {
            const conv = byId(activeId);
            if (conv) conv.updatedAt = Date.now();
        }
        if (welcome) welcome.hidden = true;
        render();
    });

    wireThemeToggle();
    open(null);
    // The composer has the focus on load, the way every chat product does: with a
    // sidebar before it, the editor is twenty-odd tab stops from the top of the page.
    // The composer's own gates (a model not selected yet) still apply to what is typed.
    chat.querySelector<HTMLElement>('aparte-composer-input')?.focus();
}

/**
 * Light or dark, on `data-aparte-theme` at the root — the one attribute core's theme
 * reads. With no attribute the OS decides, and the button's first state reflects it.
 */
function wireThemeToggle(): void {
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    const root = document.documentElement;
    const isDark = (): boolean => {
        const forced = root.getAttribute('data-aparte-theme');
        return forced ? forced === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    };
    const paint = (): void => {
        const dark = isDark();
        // Static SVG strings from the package's extended icon set — never user input.
        button.innerHTML = dark ? sunIcon : moonIcon;
        button.setAttribute('aria-label', dark ? 'Switch to the light theme' : 'Switch to the dark theme');
    };
    button.addEventListener('click', () => {
        root.setAttribute('data-aparte-theme', isDark() ? 'light' : 'dark');
        paint();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
    paint();
}
