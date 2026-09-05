/**
 * The site around the chat: the conversation list, the new-chat button, the theme
 * toggle, the settings dialog — over the library's own conversation chain, not a
 * store of this file's.
 *
 * The list is `<aparte-conversation-list>`, the drawer and the search are
 * `<aparte-sidebar>`'s, the grid is the `.aparte-app-shell` recipe. The data is an
 * `AparteConversationManager` over a storage adapter (../../_shared/sample-adapter.ts,
 * which answers after a delay on purpose), and an `AparteConversationController`
 * binds the chat to it: it hears the list's select, the composer's send, creates a
 * conversation on the first message, persists after every turn, fetches a
 * conversation's messages on demand and shows the wait on the viewport. What this
 * file adds is small: feed the list from the manager, forward the list's intents
 * to the manager, the theme toggle, the settings.
 */
import {
    AparteConversationController,
    type AparteChatViewport,
    type AparteConversationList,
} from '@aparte/core';
import {
    createSiteManager,
    documentTitleFor,
    drawSearchIcon,
    listItemsOf,
    wireSettingsDialog,
    wireThemeToggle,
} from '../../_shared/site-shell';

export function wireShell(): void {
    const list = document.querySelector<AparteConversationList>('aparte-conversation-list');
    const viewport = document.querySelector<AparteChatViewport>('aparte-chat-viewport');
    const chat = document.querySelector<HTMLElement>('aparte-chat');
    if (!list || !viewport || !chat) return;

    // The manager, registered for every <aparte-*> element on the page.
    const manager = createSiteManager();

    // The controller: the chat bound to the manager. `setLoading` is how it shows a
    // conversation on its way — the viewport draws the wait itself.
    const controller = new AparteConversationController({
        hostId: chat.id || 'main-chat',
        host: chat,
        getMessages: () => viewport.getMessages(),
        setMessages: (m) => viewport.setMessages(m),
        appendMessage: (m) => viewport.appendMessage(m),
        clearMessages: (o) => viewport.clearAll(o),
        setLoading: (on) => viewport.setLoading(on),
        exportTree: () => viewport.exportTree(),
        importTree: (t) => viewport.importTree(t),
    });
    controller.bind();

    // The list mirrors the manager: every mutation re-renders the rows, the active one
    // follows the manager's selection. The document's title carries the name — the
    // product keeps it out of the header.
    manager.subscribe(() => {
        list.conversations = listItemsOf(manager);
        const active = manager.active;
        if (active) list.setAttribute('active-id', active.id);
        else list.removeAttribute('active-id');
        document.title = documentTitleFor(manager);
    });

    // The list's intents, forwarded to the manager. Select is not here: the controller
    // hears `aparte-conversation-select` on the window and loads the conversation.
    list.addEventListener('aparte-conversation-delete', (e) => { void manager.delete((e as CustomEvent<{ id: string }>).detail.id); });
    list.addEventListener('aparte-conversation-rename', (e) => {
        const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
        void manager.updateTitle(id, title);
    });
    list.addEventListener('aparte-conversation-pin', (e) => { void manager.pin((e as CustomEvent<{ id: string }>).detail.id); });
    list.addEventListener('aparte-conversation-unpin', (e) => { void manager.unpin((e as CustomEvent<{ id: string }>).detail.id); });
    list.addEventListener('aparte-conversation-archive', (e) => { void manager.archive((e as CustomEvent<{ id: string }>).detail.id); });
    list.addEventListener('aparte-conversation-unarchive', (e) => { void manager.unarchive((e as CustomEvent<{ id: string }>).detail.id); });

    document.getElementById('new-chat')?.addEventListener('click', () => {
        void controller.setConversationId(null);
        chat.querySelector<HTMLElement>('aparte-composer-input')?.focus();
    });

    wireThemeToggle(document.getElementById('theme-toggle'));
    drawSearchIcon(document.getElementById('search-icon'));
    wireSettingsDialog(document.querySelector<HTMLDialogElement>('#settings'));
    // The composer has the focus on load, the way every chat product does: with a
    // sidebar before it, the editor is twenty-odd tab stops from the top of the page.
    chat.querySelector<HTMLElement>('aparte-composer-input')?.focus();

    // The list says it is on its way until the adapter's first answer; the manager's
    // first notification fills it.
    list.loading = true;
    void manager.init().then(() => { list.loading = false; });
}
