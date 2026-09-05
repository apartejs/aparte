import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import type {
    AparteConversationArchiveDetail,
    AparteConversationDeleteDetail,
    AparteConversationListItem,
    AparteConversationManager,
    AparteConversationPinDetail,
    AparteConversationRenameDetail,
} from '@aparte/core';
import { AparteChatComponent } from '@aparte/angular';
import { mountModelSelector } from '../../../_shared/site-setup';
import {
    WELCOME_SUGGESTIONS,
    createSiteManager,
    documentTitleFor,
    drawSearchIcon,
    listItemsOf,
    wireSettingsDialog,
    wireThemeToggle,
} from '../../../_shared/site-shell';
import { SCENARIO_MODE } from './scenario-mode';

const SUGGESTIONS_JSON = JSON.stringify(WELCOME_SUGGESTIONS);

// ?view=overlay (this example's name) or ?layout=page (the vanilla example's) —
// the overlay-composer anatomy, read once: the mode is wired when the viewport
// mounts, so a later change of the URL would not be picked up anyway.
function resolveOverlayComposer(): boolean {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'overlay' || params.get('layout') === 'page';
}

/**
 * The chat site, in Angular: the same page as the vanilla and React examples —
 * the sidebar with the conversation list, the header, the chat, the settings
 * dialog — over the library's own conversation chain.
 *
 * The sidebar, the list and the header are core's elements and recipes, used as
 * they are; the chat is `<aparte-chat>` (`@aparte/angular`'s `AparteChatComponent`),
 * whose host runs the conversation controller (it hears the list's select, creates
 * a conversation on the first message, fetches one on demand and shows the wait).
 * What this component adds: feed the list from the manager, forward the list's
 * intents, and hand the header's controls to the shared helpers — exactly what
 * `App.tsx` does in `useEffect`, done here in `ngAfterViewInit`.
 *
 * Angular binds the list's `conversations`/`loading` PROPERTIES declaratively
 * (`[conversations]`, `[loading]`) and its intents declaratively too
 * (`(aparte-conversation-delete)`, …) — where React had to reach for `listRef.current`
 * and manual `addEventListener`, a template binding is the idiomatic Angular way to
 * say the same thing, and CUSTOM_ELEMENTS_SCHEMA (below) is what lets it compile
 * against an element with no Angular wrapper of its own.
 */
@Component({
    selector: 'app-root',
    standalone: true,
    imports: [AparteChatComponent],
    // <aparte-sidebar>, <aparte-conversation-list>, <aparte-icon> and
    // <aparte-suggestions> have no Angular binding — only <aparte-chat> does
    // (AparteChatComponent, imported above, claims that tag). The OLD version of
    // this file avoided the schema entirely: with only <aparte-model-selector> to
    // cover, `AparteModelSelectorDirective` claimed that one tag and needed no
    // schema at all — and the comment there was explicit about why that mattered:
    // this schema switches template CHECKING OFF for every unknown tag in the
    // file, not just the one it is "for", so a typo'd tag name compiles silently.
    // The site needs four raw elements with no behaviour of their own to wrap in a
    // directive, so the schema is unavoidable here — the lesson still applies to
    // any tag added to this template from now on.
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
        <div class="aparte-app-shell" id="chat-view">
            <aparte-sidebar>
                <div class="aparte-sidebar__header">
                    <span class="aparte-sidebar__brand">(aparté)</span>
                    <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>
                        <aparte-icon name="menu"></aparte-icon>
                    </button>
                </div>
                <div class="site-rows">
                    <button class="site-row" type="button" id="new-chat" (click)="newChat()">
                        <aparte-icon name="edit"></aparte-icon>
                        <span>New chat</span>
                    </button>
                    <label class="site-row site-row--search">
                        <span class="site-row__icon" #searchIcon aria-hidden="true"></span>
                        <!-- data-aparte-sidebar-search: the sidebar filters the list itself. -->
                        <input class="site-search" type="search" placeholder="Search chats" aria-label="Search chats" data-aparte-sidebar-search />
                    </label>
                </div>
                <div class="aparte-sidebar__body">
                    <aparte-conversation-list
                        [conversations]="items()"
                        [loading]="listLoading()"
                        [attr.active-id]="activeId()"
                        (aparte-conversation-delete)="onDelete($event)"
                        (aparte-conversation-rename)="onRename($event)"
                        (aparte-conversation-pin)="onPin($event)"
                        (aparte-conversation-unpin)="onUnpin($event)"
                        (aparte-conversation-archive)="onArchive($event)"
                        (aparte-conversation-unarchive)="onUnarchive($event)"
                    ></aparte-conversation-list>
                </div>
                <div class="aparte-sidebar__footer">
                    <span class="aparte-avatar aparte-avatar--sm" aria-hidden="true">P</span>
                    <span class="who">Paul</span>
                </div>
            </aparte-sidebar>

            <header class="aparte-app-header">
                <!-- data-aparte-sidebar-toggle: the sidebar listens for it on its own. -->
                <button class="aparte-btn aparte-btn--icon aparte-app-header__toggle" type="button"
                        aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>
                    <aparte-icon name="menu"></aparte-icon>
                </button>
                <!-- The product's header names the MODEL, not the conversation: the picker on
                     the start edge (main.ts's setupSite mounts the real selector here with a
                     local server; the scripted model has one name), the actions on the end
                     edge. The conversation's name lives in the sidebar's active row and in
                     the document title. -->
                <div class="site-model" id="model-slot" #modelSlot><span class="site-model__name">ChatClone</span></div>
                <div class="aparte-app-header__actions">
                    <!-- Its glyph comes from the extended icon set, drawn by wireThemeToggle. -->
                    <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" id="theme-toggle" #themeToggle aria-label="Switch to the light theme"></button>
                    <button class="aparte-btn aparte-btn--ghost aparte-btn--sm" type="button" data-aparte-dialog-open="settings">Settings</button>
                </div>
            </header>

            <main class="aparte-app-shell__main">
                <aparte-chat centerWhenEmpty attachments placeholder="Ask ChatClone" [overlayComposer]="overlay">
                    <div slot="empty-state" class="welcome" id="welcome">
                        <div class="welcome__body">
                            <h2>Where should we begin?</h2>
                            <!-- The starters go through the composer's own submit(), so every gate
                                 it has (disabled, streaming, model not selected yet) applies to a
                                 click too. Each one matches a scripted scenario. -->
                            <aparte-suggestions empty-only [attr.suggestions]="suggestionsJson"></aparte-suggestions>
                        </div>
                    </div>
                    <!-- No [slot='toolbar'] content: the row stays empty, exactly like vanilla's
                         bare <aparte-composer-toolbar></aparte-composer-toolbar> — the model
                         selector lands there under ?selector=toolbar (ngAfterViewInit below). -->
                </aparte-chat>
            </main>
        </div>

        <!-- The settings a consumer changes first, in the kit's dialog: a native <dialog>
             wearing the recipe, opened by the header button through data-aparte-dialog-open
             (core installs the triggers). Two of the three text fields exist because they
             have no setter: an endpoint and a token reach a provider only through the KEY
             RESOLVER, which may return an apiKey/endpoint record instead of a bare string.
             ?view=settings opens it on load, so it stays a link a reader can share. -->
        <dialog class="aparte-dialog aparte-dialog--lg" id="settings" aria-labelledby="settings-title" #settingsDialog>
            <div class="aparte-dialog__header">
                <h2 class="aparte-dialog__title" id="settings-title">Settings</h2>
                <button class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-dialog__close" type="button" aria-label="Close" data-aparte-dialog-close>
                    <aparte-icon name="close"></aparte-icon>
                </button>
            </div>
            <div class="aparte-dialog__body settings-body">
                <fieldset class="settings-group">
                    <legend class="aparte-field-label">Model</legend>
                    <label class="aparte-field-choice">
                        <input type="radio" class="aparte-radio" name="model-source" value="scripted" id="model-source-scripted" />
                        <span class="aparte-field-choice__body">Scripted model — no server, no key, the same replies every time</span>
                    </label>
                    <label class="aparte-field-choice">
                        <input type="radio" class="aparte-radio" name="model-source" value="local" id="model-source-local" />
                        <span class="aparte-field-choice__body">Local server — Ollama or LM Studio, reached with the two fields below</span>
                    </label>
                    <p class="aparte-field-hint">
                        The scripted model is <code>&#64;aparte/provider-scenario</code>; the local one is
                        <code>&#64;aparte/provider-openai-compat</code> with its Ollama and LM Studio presets.
                        <code>?scenario</code> and <code>?local</code> in the URL override this choice.
                    </p>
                </fieldset>

                <div class="settings-group">
                    <label class="aparte-field-label" for="system-prompt">System prompt</label>
                    <textarea id="system-prompt" aria-describedby="system-prompt-hint" class="aparte-field settings-textarea" rows="5" spellcheck="false" placeholder="Leave empty to send no system turn."></textarea>
                    <p class="aparte-field-hint" id="system-prompt-hint">
                        Sent as the <code>system</code> turn. Supports <code ngNonBindable>{{key}}</code> placeholders — resolve
                        them with <code>setSystemPromptVarsProvider()</code>.
                    </p>
                </div>

                <div class="settings-group">
                    <label class="aparte-field-label" for="endpoint">Endpoint</label>
                    <input id="endpoint" aria-describedby="endpoint-hint" class="aparte-field" type="url" autocomplete="off" spellcheck="false" placeholder="Empty = the selected provider's own default" />
                    <p class="aparte-field-hint" id="endpoint-hint">
                        Any OpenAI-compatible base URL — LM Studio, Ollama, vLLM, llama.cpp, a hosted API.
                        Reaches the provider through the key resolver as <code>&#123; endpoint &#125;</code>, which is the
                        only runtime channel for it.
                    </p>
                </div>

                <div class="settings-group">
                    <label class="aparte-field-label" for="token">Token</label>
                    <input id="token" aria-describedby="token-hint" class="aparte-field" type="password" autocomplete="off" spellcheck="false" placeholder="Empty is correct for a local server" />
                    <p class="aparte-field-hint" id="token-hint">
                        Stays in this browser — it is sent straight to the endpoint above, which is what BYOK
                        means. For a key that must not reach the browser, use <code>AparteBackendTransport</code>
                        instead.
                    </p>
                </div>
            </div>
            <div class="aparte-dialog__footer">
                <button class="aparte-btn aparte-btn--ghost" type="button" id="settings-reset">Reset to defaults</button>
                <button class="aparte-btn aparte-btn--primary aparte-btn--solid" type="button" data-aparte-dialog-close>Done</button>
            </div>
        </dialog>
    `,
})
export class AppComponent implements AfterViewInit, OnDestroy {
    private readonly scenarioMode = inject(SCENARIO_MODE);

    protected readonly suggestionsJson = SUGGESTIONS_JSON;
    protected readonly overlay = resolveOverlayComposer();

    // The list's rows and its wait, fed from the manager below. Bound onto
    // <aparte-conversation-list> as PROPERTIES ([conversations], [loading]) in the
    // template — Angular's property-binding syntax is the declarative form of what
    // React does imperatively (`listRef.current.conversations = items`).
    protected readonly items = signal<AparteConversationListItem[]>([]);
    protected readonly activeId = signal<string | null>(null);
    protected readonly listLoading = signal(true);

    private readonly chat = viewChild.required(AparteChatComponent);
    private readonly settingsDialog = viewChild.required<ElementRef<HTMLDialogElement>>('settingsDialog');
    private readonly themeToggle = viewChild.required<ElementRef<HTMLButtonElement>>('themeToggle');
    private readonly searchIcon = viewChild.required<ElementRef<HTMLSpanElement>>('searchIcon');
    private readonly modelSlot = viewChild.required<ElementRef<HTMLDivElement>>('modelSlot');

    private manager?: AparteConversationManager;
    private unsubscribe?: () => void;

    // The site's wiring, once: the manager registered for every element on the page,
    // the list fed from it, its intents forwarded (declaratively, in the template),
    // the header's controls.
    ngAfterViewInit(): void {
        const manager = createSiteManager();
        this.manager = manager;
        // Select is not here: the chat's controller hears `aparte-conversation-select`
        // on the window and loads the conversation.
        this.unsubscribe = manager.subscribe(() => {
            this.items.set(listItemsOf(manager));
            this.activeId.set(manager.active?.id ?? null);
            document.title = documentTitleFor(manager);
        });

        wireThemeToggle(this.themeToggle().nativeElement);
        drawSearchIcon(this.searchIcon().nativeElement);
        wireSettingsDialog(this.settingsDialog().nativeElement);
        // The model selector, only with a local server, in the header where the
        // product keeps its picker.
        if (!this.scenarioMode) {
            mountModelSelector(this.modelSlot().nativeElement, document.querySelector('aparte-composer-toolbar'));
        }
        // The list says it is on its way until the adapter's first answer.
        void manager.init().then(() => this.listLoading.set(false));
        this.chat().focusInput();
    }

    ngOnDestroy(): void {
        this.unsubscribe?.();
    }

    protected newChat(): void {
        void this.chat().setConversationId(null);
        this.chat().focusInput();
    }

    protected onDelete(e: CustomEvent<AparteConversationDeleteDetail>): void {
        void this.manager?.delete(e.detail.id);
    }
    protected onRename(e: CustomEvent<AparteConversationRenameDetail>): void {
        void this.manager?.updateTitle(e.detail.id, e.detail.title);
    }
    protected onPin(e: CustomEvent<AparteConversationPinDetail>): void {
        void this.manager?.pin(e.detail.id);
    }
    protected onUnpin(e: CustomEvent<AparteConversationPinDetail>): void {
        void this.manager?.unpin(e.detail.id);
    }
    protected onArchive(e: CustomEvent<AparteConversationArchiveDetail>): void {
        void this.manager?.archive(e.detail.id);
    }
    protected onUnarchive(e: CustomEvent<AparteConversationArchiveDetail>): void {
        void this.manager?.unarchive(e.detail.id);
    }
}
