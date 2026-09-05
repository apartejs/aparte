<script lang="ts">
  /**
   * The chat site, in Svelte 4: the same page as the vanilla and React examples — the
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
  import { onMount } from 'svelte';
  import { AparteChat, createAparteChat } from '@aparte/svelte';
  import type { AparteConversationList, AparteConversationListItem, AparteMessage } from '@aparte/core';
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

  export let scenarioMode: boolean;

  const SUGGESTIONS_JSON = JSON.stringify(WELCOME_SUGGESTIONS);

  const chat = createAparteChat();
  const { messages } = chat;
  let comp: AparteChat | null = null;
  $: chat.connect(comp);

  function handleMessagesChange(e: CustomEvent<AparteMessage[]>) {
    chat.onMessagesChange(e.detail);
  }

  let listEl: AparteConversationList | null = null;
  let dialogEl: HTMLDialogElement | null = null;
  let themeEl: HTMLButtonElement | null = null;
  let searchIconEl: HTMLSpanElement | null = null;
  let modelSlotEl: HTMLDivElement | null = null;
  let suggestionsEl: HTMLElement | null = null;

  let items: AparteConversationListItem[] = [];
  let activeId: string | null = null;
  let listLoading = true;

  // `conversations` and `loading` have no plain-string attribute form (an array, and
  // a boolean with no HTML-boolean equivalent svelte-check will accept on a custom
  // element) — set as PROPERTIES, imperatively, the same way the React example does
  // through a ref effect.
  $: if (listEl) {
    listEl.conversations = items;
    listEl.loading = listLoading;
  }

  // `?view=overlay` (this example's name) or `?layout=page` (the vanilla example's)
  // — the overlay-composer anatomy, read once: the mode is wired when the viewport mounts.
  const params = new URLSearchParams(window.location.search);
  const overlay = params.get('view') === 'overlay' || params.get('layout') === 'page';

  // The site's wiring, once: the manager registered for every element on the page,
  // the list fed from it, its intents forwarded, the header's controls.
  onMount(() => {
    const manager = createSiteManager();
    const unsubscribe = manager.subscribe(() => {
      items = listItemsOf(manager);
      activeId = manager.active?.id ?? null;
      document.title = documentTitleFor(manager);
    });
    // Select is not here: the chat's controller hears `aparte-conversation-select`
    // on the window and loads the conversation.
    const on = (name: string, fn: (detail: { id: string; title: string }) => void) => {
      const handler = (e: Event) => fn((e as CustomEvent<{ id: string; title: string }>).detail);
      listEl?.addEventListener(name, handler);
      return () => listEl?.removeEventListener(name, handler);
    };
    const offs = [
      on('aparte-conversation-delete', ({ id }) => { void manager.delete(id); }),
      on('aparte-conversation-rename', ({ id, title }) => { void manager.updateTitle(id, title); }),
      on('aparte-conversation-pin', ({ id }) => { void manager.pin(id); }),
      on('aparte-conversation-unpin', ({ id }) => { void manager.unpin(id); }),
      on('aparte-conversation-archive', ({ id }) => { void manager.archive(id); }),
      on('aparte-conversation-unarchive', ({ id }) => { void manager.unarchive(id); }),
    ];
    wireThemeToggle(themeEl);
    drawSearchIcon(searchIconEl);
    wireSettingsDialog(dialogEl);
    // `suggestions` must reach the element as an ATTRIBUTE (its JSON form): Svelte
    // would otherwise hand the raw string to the element's `suggestions` PROPERTY,
    // whose setter expects the parsed array. `empty-only` is set the same way rather
    // than as a bare template attribute, which svelte-check types as a literal `''`.
    suggestionsEl?.setAttribute('suggestions', SUGGESTIONS_JSON);
    suggestionsEl?.setAttribute('empty-only', '');
    // The model selector, only with a local server, in the header where the
    // product keeps its picker.
    if (!scenarioMode) mountModelSelector(modelSlotEl, document.querySelector('aparte-composer-toolbar'));
    // The list says it is on its way until the adapter's first answer.
    void manager.init().then(() => { listLoading = false; });
    comp?.focusInput();
    return () => { unsubscribe(); for (const off of offs) off(); };
  });

  function newChat() {
    void comp?.setConversationId(null);
    comp?.focusInput();
  }
</script>

<div class="aparte-app-shell" id="chat-view">
  <aparte-sidebar>
    <div class="aparte-sidebar__header">
      <span class="aparte-sidebar__brand">(aparté)</span>
      <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" aria-label="Toggle the sidebar" data-aparte-sidebar-toggle>
        <aparte-icon name="menu"></aparte-icon>
      </button>
    </div>
    <div class="site-rows">
      <button class="site-row" type="button" id="new-chat" on:click={newChat}>
        <aparte-icon name="edit"></aparte-icon>
        <span>New chat</span>
      </button>
      <label class="site-row site-row--search">
        <span class="site-row__icon" bind:this={searchIconEl} aria-hidden="true"></span>
        <!-- `data-aparte-sidebar-search`: the sidebar filters the list itself. -->
        <input class="site-search" type="search" placeholder="Search chats" aria-label="Search chats" data-aparte-sidebar-search />
      </label>
    </div>
    <div class="aparte-sidebar__body">
      <aparte-conversation-list bind:this={listEl} active-id={activeId ?? undefined}></aparte-conversation-list>
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
         start edge, the actions on the end edge. The conversation's name lives in the
         sidebar's active row and in the document title. -->
    <div class="site-model" id="model-slot" bind:this={modelSlotEl}><span class="site-model__name">ChatClone</span></div>
    <div class="aparte-app-header__actions">
      <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" id="theme-toggle" bind:this={themeEl} aria-label="Switch to the light theme"></button>
      <button class="aparte-btn aparte-btn--ghost aparte-btn--sm" type="button" data-aparte-dialog-open="settings">Settings</button>
    </div>
  </header>

  <main class="aparte-app-shell__main">
    <AparteChat
      bind:this={comp}
      messages={$messages}
      on:messagesChange={handleMessagesChange}
      centerWhenEmpty
      overlayComposer={overlay}
      attachments
      placeholder="Ask ChatClone"
    >
      <div slot="empty-state" class="welcome" id="welcome">
        <div class="welcome__body">
          <h2>Where should we begin?</h2>
          <!-- The starters go through the composer's own submit(), so every gate it
               has (disabled, streaming, model not selected yet) applies to a click
               too. Each one matches a scripted scenario. -->
          <aparte-suggestions bind:this={suggestionsEl}></aparte-suggestions>
        </div>
      </div>
      <!-- The toolbar row under the composer: empty, so it draws nothing (the model
           selector lands there under `?selector=toolbar`). An empty fragment does not
           count as a provided slot, so the row would not exist at all: one hidden
           child makes the slot real, and the row ignores hidden children. -->
      <span slot="toolbar" hidden></span>
    </AparteChat>
  </main>
</div>

<!-- The settings a consumer changes first, in the kit's dialog: a native <dialog>
     wearing the recipe, opened by the header button through data-aparte-dialog-open
     (core installs the triggers). The fields are read and written by the shared
     wiring, not by Svelte state: what they hold is the page's stored settings. -->
<dialog class="aparte-dialog aparte-dialog--lg" id="settings" aria-labelledby="settings-title" bind:this={dialogEl}>
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
        Sent as the <code>system</code> turn. Supports <code>{'{{key}}'}</code> placeholders — resolve
        them with <code>setSystemPromptVarsProvider()</code>.
      </p>
    </div>

    <div class="settings-group">
      <label class="aparte-field-label" for="endpoint">Endpoint</label>
      <input id="endpoint" aria-describedby="endpoint-hint" class="aparte-field" type="url" autocomplete="off" spellcheck="false" placeholder="Empty = the selected provider's own default" />
      <p class="aparte-field-hint" id="endpoint-hint">
        Any OpenAI-compatible base URL — LM Studio, Ollama, vLLM, llama.cpp, a hosted API.
        Reaches the provider through the key resolver as <code>{'{ endpoint }'}</code>, which is the
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
