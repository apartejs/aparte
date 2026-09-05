<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { AparteChat, useAparteChat } from '@aparte/vue';
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

/**
 * The chat site, in Vue: the same page as the vanilla and React examples — the
 * sidebar with the conversation list, the header, the chat, the settings dialog —
 * over the library's own conversation chain.
 *
 * The sidebar, the list and the header are core's elements and recipes, used as
 * they are; the chat is `<AparteChat>`, whose host runs the conversation controller
 * (it hears the list's select, creates a conversation on the first message, fetches
 * one on demand and shows the wait). What this component adds: feed the list from
 * the manager, forward the list's intents, and hand the header's controls to the
 * shared helpers.
 */
const props = defineProps<{ scenarioMode: boolean }>();

const SUGGESTIONS_JSON = JSON.stringify(WELCOME_SUGGESTIONS);

const chat = useAparteChat();
const listRef = ref<AparteConversationList | null>(null);
const dialogRef = ref<HTMLDialogElement | null>(null);
const themeRef = ref<HTMLButtonElement | null>(null);
const searchIconRef = ref<HTMLSpanElement | null>(null);
const modelSlotRef = ref<HTMLDivElement | null>(null);
const items = ref<AparteConversationListItem[]>([]);
const activeId = ref<string | null>(null);
const listLoading = ref(true);

// `?view=overlay` (this example's name) or `?layout=page` (the vanilla example's)
// — the overlay-composer anatomy, read once: the mode is wired when the viewport mounts.
const params = new URLSearchParams(window.location.search);
const overlay = params.get('view') === 'overlay' || params.get('layout') === 'page';

let unsubscribe: (() => void) | null = null;
let offs: Array<() => void> = [];

// The site's wiring, once: the manager registered for every element on the page,
// the list fed from it, its intents forwarded, the header's controls.
onMounted(() => {
    const manager = createSiteManager();
    const list = listRef.value;
    unsubscribe = manager.subscribe(() => {
        items.value = listItemsOf(manager);
        activeId.value = manager.active?.id ?? null;
        document.title = documentTitleFor(manager);
    });
    // Select is not here: the chat's controller hears `aparte-conversation-select`
    // on the window and loads the conversation.
    const on = (name: string, fn: (detail: { id: string; title: string }) => void) => {
        const handler = (e: Event) => fn((e as CustomEvent<{ id: string; title: string }>).detail);
        list?.addEventListener(name, handler);
        return () => list?.removeEventListener(name, handler);
    };
    offs = [
        on('aparte-conversation-delete', ({ id }) => { void manager.delete(id); }),
        on('aparte-conversation-rename', ({ id, title }) => { void manager.updateTitle(id, title); }),
        on('aparte-conversation-pin', ({ id }) => { void manager.pin(id); }),
        on('aparte-conversation-unpin', ({ id }) => { void manager.unpin(id); }),
        on('aparte-conversation-archive', ({ id }) => { void manager.archive(id); }),
        on('aparte-conversation-unarchive', ({ id }) => { void manager.unarchive(id); }),
    ];
    wireThemeToggle(themeRef.value);
    drawSearchIcon(searchIconRef.value);
    wireSettingsDialog(dialogRef.value);
    // The model selector, only with a local server, in the header where the
    // product keeps its picker.
    if (!props.scenarioMode) mountModelSelector(modelSlotRef.value, document.querySelector('aparte-composer-toolbar'));
    // The list says it is on its way until the adapter's first answer. A rejecting
    // `loadMeta` must still clear the wait — the library has no error state for it,
    // so a `console.warn` is what tells the developer their adapter failed instead
    // of leaving the skeleton up forever.
    void manager.init()
        .then(() => { listLoading.value = false; })
        .catch((err: unknown) => {
            listLoading.value = false;
            console.warn('[chat-site] failed to load conversations', err);
        });
    chat.chatRef.value?.focusInput();
});

onBeforeUnmount(() => {
    unsubscribe?.();
    for (const off of offs) off();
});

function newChat(): void {
    void chat.chatRef.value?.setConversationId(null);
    chat.chatRef.value?.focusInput();
}
</script>

<template>
    <div class="aparte-app-shell" id="chat-view">
        <aparte-sidebar>
            <!-- The brand row, then the two rows every chat product opens with: a new
                 conversation and the search. Rows, not icon buttons — the product draws
                 them as 36px rows with an icon and a label. -->
            <div class="aparte-sidebar__header">
                <span class="aparte-sidebar__brand">(aparté)</span>
                <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>
                    <aparte-icon name="menu"></aparte-icon>
                </button>
            </div>
            <div class="site-rows">
                <button class="site-row" type="button" id="new-chat" @click="newChat">
                    <aparte-icon name="edit"></aparte-icon>
                    <span>New chat</span>
                </button>
                <label class="site-row site-row--search">
                    <span class="site-row__icon" ref="searchIconRef" aria-hidden="true"></span>
                    <!-- `data-aparte-sidebar-search`: the sidebar filters the list itself. -->
                    <input class="site-search" type="search" placeholder="Search chats" aria-label="Search chats" data-aparte-sidebar-search />
                </label>
            </div>
            <div class="aparte-sidebar__body">
                <aparte-conversation-list ref="listRef" :conversations="items" :loading="listLoading ? '' : null" :active-id="activeId ?? null"></aparte-conversation-list>
            </div>
            <div class="aparte-sidebar__footer">
                <span class="aparte-avatar aparte-avatar--sm" aria-hidden="true">P</span>
                <span class="who">Paul</span>
            </div>
        </aparte-sidebar>

        <header class="aparte-app-header">
            <!-- `data-aparte-sidebar-toggle`: the sidebar listens for it on its own. -->
            <button class="aparte-btn aparte-btn--icon aparte-app-header__toggle" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>
                <aparte-icon name="menu"></aparte-icon>
            </button>
            <!-- The product's header names the MODEL, not the conversation: the picker on the
                 start edge (mounted with a local server; the scripted model has one name), the
                 actions on the end edge. The conversation's name lives in the sidebar's active
                 row and in the document title. -->
            <div class="site-model" id="model-slot" ref="modelSlotRef"><span class="site-model__name">ChatClone</span></div>
            <div class="aparte-app-header__actions">
                <!-- Its glyph comes from the extended icon set (`@aparte/core/icons`), so
                     the shared helper draws it; the label says what a press does. -->
                <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" id="theme-toggle" ref="themeRef" aria-label="Switch to the light theme"></button>
                <button class="aparte-btn aparte-btn--ghost aparte-btn--sm" type="button" data-aparte-dialog-open="settings">Settings</button>
            </div>
        </header>

        <main class="aparte-app-shell__main">
            <AparteChat
                :ref="chat.chatRef"
                :messages="chat.messages.value"
                @messages-change="chat.onMessagesChange"
                center-when-empty
                :overlay-composer="overlay"
                attachments
                placeholder="Ask ChatClone"
            >
                <!-- The toolbar row under the composer: empty, so it draws nothing; the
                     model selector lands there under `?selector=toolbar`. -->
                <template #toolbar></template>
                <template #empty-state>
                    <div class="welcome" id="welcome">
                        <div class="welcome__body">
                            <h2>Where should we begin?</h2>
                            <!-- The starters go through the composer's own submit(), so every gate
                                 it has applies to a click too. Each one matches a scripted scenario.
                                 `.attr` forces attribute-setting: the property setter expects an
                                 ARRAY, and this is the JSON string form. -->
                            <aparte-suggestions empty-only :suggestions.attr="SUGGESTIONS_JSON"></aparte-suggestions>
                        </div>
                    </div>
                </template>
            </AparteChat>
        </main>
    </div>

    <!-- The settings a consumer changes first, in the kit's dialog: a native <dialog>
         wearing the recipe, opened by the header button through data-aparte-dialog-open
         (core installs the triggers). The fields are read and written by the shared
         wiring, not by Vue state: what they hold is the page's stored settings. -->
    <dialog class="aparte-dialog aparte-dialog--lg" id="settings" aria-labelledby="settings-title" ref="dialogRef">
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
                    The scripted model is <code>@aparte/provider-scenario</code>; the local one is
                    <code>@aparte/provider-openai-compat</code> with its Ollama and LM Studio presets.
                    <code>?scenario</code> and <code>?local</code> in the URL override this choice.
                </p>
            </fieldset>

            <div class="settings-group">
                <label class="aparte-field-label" for="system-prompt">System prompt</label>
                <textarea id="system-prompt" aria-describedby="system-prompt-hint" class="aparte-field settings-textarea" rows="5" spellcheck="false" placeholder="Leave empty to send no system turn."></textarea>
                <p class="aparte-field-hint" id="system-prompt-hint">
                    Sent as the <code>system</code> turn. Supports <code v-pre>{{key}}</code> placeholders — resolve
                    them with <code>setSystemPromptVarsProvider()</code>.
                </p>
            </div>

            <div class="settings-group">
                <label class="aparte-field-label" for="endpoint">Endpoint</label>
                <input id="endpoint" aria-describedby="endpoint-hint" class="aparte-field" type="url" autocomplete="off" spellcheck="false" placeholder="Empty = the selected provider's own default" />
                <p class="aparte-field-hint" id="endpoint-hint">
                    Any OpenAI-compatible base URL — LM Studio, Ollama, vLLM, llama.cpp, a hosted API.
                    Reaches the provider through the key resolver as <code>{ endpoint }</code>, which is the
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
</template>
