import { useEffect, useRef, useState } from 'react';
import { AparteChat, AparteUi, useAparteChat } from '@aparte/react';
import type { AparteConversationList, AparteConversationListItem } from '@aparte/core';
import { mountModelSelector } from '../../_shared/site-setup';
import {
    WELCOME_SUGGESTIONS,
    createSiteManager,
    documentTitleFor,
    drawSearchIcon,
    listItemsOf,
    wireSettingsDialog,
    wireThemeToggle,
} from '../../_shared/site-shell';

const SUGGESTIONS_JSON = JSON.stringify(WELCOME_SUGGESTIONS);

/**
 * The chat site, in React: the same page as the vanilla example — the sidebar with
 * the conversation list, the header, the chat, the settings dialog — over the
 * library's own conversation chain.
 *
 * The sidebar, the list and the header are core's elements and recipes, used as
 * they are; the chat is `<AparteChat>`, whose host runs the conversation controller
 * (it hears the list's select, creates a conversation on the first message, fetches
 * one on demand and shows the wait). What this component adds: feed the list from
 * the manager, forward the list's intents, and hand the header's controls to the
 * shared helpers.
 */
export default function App({ scenarioMode }: { scenarioMode: boolean }) {
    const chat = useAparteChat();
    const listRef = useRef<AparteConversationList | null>(null);
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const themeRef = useRef<HTMLButtonElement | null>(null);
    const searchIconRef = useRef<HTMLSpanElement | null>(null);
    const modelSlotRef = useRef<HTMLDivElement | null>(null);
    const [items, setItems] = useState<AparteConversationListItem[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [listLoading, setListLoading] = useState(true);
    // `?view=overlay` (this example's name) or `?layout=page` (the vanilla example's)
    // — the overlay-composer anatomy, read once: the mode is wired when the viewport mounts.
    const params = new URLSearchParams(window.location.search);
    const overlay = params.get('view') === 'overlay' || params.get('layout') === 'page';

    // The site's wiring, once: the manager registered for every element on the page,
    // the list fed from it, the header's controls.
    useEffect(() => {
        const manager = createSiteManager();
        const unsubscribe = manager.subscribe(() => {
            setItems(listItemsOf(manager));
            setActiveId(manager.active?.id ?? null);
            document.title = documentTitleFor(manager);
        });
        // The row menu's writes need no listener: `manage` on the element lets the list
        // carry them out on the manager `createSiteManager()` registered. Select is not
        // one of them — the chat's controller hears `aparte-conversation-select` on the
        // window and loads the conversation.
        wireThemeToggle(themeRef.current);
        drawSearchIcon(searchIconRef.current);
        wireSettingsDialog(dialogRef.current);
        // The model selector, only with a local server, in the header where the
        // product keeps its picker.
        if (!scenarioMode) mountModelSelector(modelSlotRef.current, document.querySelector('aparte-composer-toolbar'));
        // The list says it is on its way until the adapter's first answer. A
        // rejecting `loadMeta` must still clear the wait — the library has no error
        // state for it, so a `console.warn` is what tells the developer their
        // adapter failed instead of leaving the skeleton up forever.
        void manager.init()
            .then(() => setListLoading(false))
            .catch((err: unknown) => {
                setListLoading(false);
                console.warn('[chat-site] failed to load conversations', err);
            });
        chat.ref.current?.focusInput();
        return () => { unsubscribe(); };
    }, []);

    // The list's rows and its wait are PROPERTIES of the element, set imperatively:
    // React 19 sets a matching prop as a property, and `loading=""` through the setter
    // reads as false.
    useEffect(() => { if (listRef.current) listRef.current.conversations = items; }, [items]);
    useEffect(() => { if (listRef.current) listRef.current.loading = listLoading; }, [listLoading]);

    const newChat = () => {
        void chat.ref.current?.setConversationId(null);
        chat.ref.current?.focusInput();
    };

    return (
        <>
            <div className="aparte-app-shell" id="chat-view">
                <aparte-sidebar>
                    <div className="aparte-sidebar__header">
                        <span className="aparte-sidebar__brand">(aparté)</span>
                        <button className="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle="">
                            <aparte-icon name="menu" />
                        </button>
                    </div>
                    <div className="site-rows">
                        <button className="site-row" type="button" id="new-chat" onClick={newChat}>
                            <aparte-icon name="edit" />
                            <span>New chat</span>
                        </button>
                        <label className="site-row site-row--search">
                            <span className="site-row__icon" ref={searchIconRef} aria-hidden="true" />
                            {/* `data-aparte-sidebar-search`: the sidebar filters the list itself. */}
                            <input className="site-search" type="search" placeholder="Search chats" aria-label="Search chats" data-aparte-sidebar-search="" />
                        </label>
                    </div>
                    <div className="aparte-sidebar__body">
                        <aparte-conversation-list ref={listRef as React.Ref<HTMLElement>} active-id={activeId ?? undefined} manage="" />
                    </div>
                    <div className="aparte-sidebar__footer">
                        <span className="aparte-avatar aparte-avatar--sm" aria-hidden="true">P</span>
                        <span className="who">Paul</span>
                    </div>
                </aparte-sidebar>

                <header className="aparte-app-header">
                    {/* `data-aparte-sidebar-toggle`: the sidebar listens for it on its own. */}
                    <button className="aparte-btn aparte-btn--icon aparte-app-header__toggle" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle="">
                        <aparte-icon name="menu" />
                    </button>
                    {/* The product's header names the MODEL, not the conversation: the picker on
                        the start edge, the actions on the end edge. The conversation's name lives
                        in the sidebar's active row and in the document title. */}
                    <div className="site-model" id="model-slot" ref={modelSlotRef}><span className="site-model__name">ChatClone</span></div>
                    <div className="aparte-app-header__actions">
                        <button className="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" id="theme-toggle" ref={themeRef} aria-label="Switch to the light theme" />
                        <button className="aparte-btn aparte-btn--ghost aparte-btn--sm" type="button" data-aparte-dialog-open="settings">Settings</button>
                    </div>
                </header>

                <main className="aparte-app-shell__main">
                    <AparteChat
                        ref={chat.ref}
                        messages={chat.messages}
                        onMessagesChange={chat.setMessages}
                        centerWhenEmpty
                        overlayComposer={overlay}
                        attachments
                        placeholder="Ask ChatClone"
                        // The toolbar row under the composer: the approval switch, and the
                        // model selector too under `?selector=toolbar`. `<AparteUi>` rather
                        // than a raw `<aparte-approval-mode>` tag — the plugin ships no
                        // React subpath, and this is the documented way to mount any
                        // aparté element from React without one.
                        toolbar={<AparteUi name="aparte-approval-mode" />}
                        emptyState={
                            <div className="welcome" id="welcome">
                                <div className="welcome__body">
                                    <h2>Where should we begin?</h2>
                                    {/* The starters go through the composer's own submit(), so every gate
                                        it has applies to a click too. Each one matches a scripted scenario. */}
                                    <aparte-suggestions empty-only="" ref={(el: HTMLElement | null) => el?.setAttribute('suggestions', SUGGESTIONS_JSON)} />
                                </div>
                            </div>
                        }
                    />
                </main>
            </div>

            {/* The settings a consumer changes first, in the kit's dialog: a native <dialog>
                wearing the recipe, opened by the header button through data-aparte-dialog-open
                (core installs the triggers). The fields are read and written by the shared
                wiring, not by React state: what they hold is the page's stored settings. */}
            <dialog className="aparte-dialog aparte-dialog--lg" id="settings" aria-labelledby="settings-title" ref={dialogRef}>
                <div className="aparte-dialog__header">
                    <h2 className="aparte-dialog__title" id="settings-title">Settings</h2>
                    <button className="aparte-btn aparte-btn--icon aparte-btn--sm aparte-dialog__close" type="button" aria-label="Close" data-aparte-dialog-close="">
                        <aparte-icon name="close" />
                    </button>
                </div>
                <div className="aparte-dialog__body settings-body">
                    <fieldset className="settings-group">
                        <legend className="aparte-field-label">Model</legend>
                        <label className="aparte-field-choice">
                            <input type="radio" className="aparte-radio" name="model-source" value="scripted" id="model-source-scripted" />
                            <span className="aparte-field-choice__body">Scripted model — no server, no key, the same replies every time</span>
                        </label>
                        <label className="aparte-field-choice">
                            <input type="radio" className="aparte-radio" name="model-source" value="local" id="model-source-local" />
                            <span className="aparte-field-choice__body">Local server — Ollama or LM Studio, reached with the two fields below</span>
                        </label>
                        <p className="aparte-field-hint">
                            The scripted model is <code>@aparte/provider-scenario</code>; the local one is
                            <code>@aparte/provider-openai-compat</code> with its Ollama and LM Studio presets.
                            <code>?scenario</code> and <code>?local</code> in the URL override this choice.
                        </p>
                    </fieldset>

                    <div className="settings-group">
                        <label className="aparte-field-label" htmlFor="system-prompt">System prompt</label>
                        <textarea id="system-prompt" aria-describedby="system-prompt-hint" className="aparte-field settings-textarea" rows={5} spellCheck={false} placeholder="Leave empty to send no system turn." />
                        <p className="aparte-field-hint" id="system-prompt-hint">
                            Sent as the <code>system</code> turn. Supports <code>{'{{key}}'}</code> placeholders — resolve
                            them with <code>setSystemPromptVarsProvider()</code>.
                        </p>
                    </div>

                    <div className="settings-group">
                        <label className="aparte-field-label" htmlFor="endpoint">Endpoint</label>
                        <input id="endpoint" aria-describedby="endpoint-hint" className="aparte-field" type="url" autoComplete="off" spellCheck={false} placeholder="Empty = the selected provider's own default" />
                        <p className="aparte-field-hint" id="endpoint-hint">
                            Any OpenAI-compatible base URL — LM Studio, Ollama, vLLM, llama.cpp, a hosted API.
                            Reaches the provider through the key resolver as <code>{'{ endpoint }'}</code>, which is the
                            only runtime channel for it.
                        </p>
                    </div>

                    <div className="settings-group">
                        <label className="aparte-field-label" htmlFor="token">Token</label>
                        <input id="token" aria-describedby="token-hint" className="aparte-field" type="password" autoComplete="off" spellCheck={false} placeholder="Empty is correct for a local server" />
                        <p className="aparte-field-hint" id="token-hint">
                            Stays in this browser — it is sent straight to the endpoint above, which is what BYOK
                            means. For a key that must not reach the browser, use <code>AparteBackendTransport</code>
                            instead.
                        </p>
                    </div>
                </div>
                <div className="aparte-dialog__footer">
                    <button className="aparte-btn aparte-btn--ghost" type="button" id="settings-reset">Reset to defaults</button>
                    <button className="aparte-btn aparte-btn--primary aparte-btn--solid" type="button" data-aparte-dialog-close="">Done</button>
                </div>
            </dialog>
        </>
    );
}
