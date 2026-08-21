<script lang="ts">
  import { AparteChat, AparteUi, createAparteChat } from '@aparte/svelte';
  import { AparteConfig, DEFAULT_LOCALE } from '@aparte/core';
  import { KEY_STORAGE, sendPrompt } from './aparte';

  // A real control, not a decoration: switching the locale renames the bubbles live
  // AND flips the reading direction, composer included. A showcase button that changed
  // nothing would break the library's own rule (#8) in the library's own showcase.
  const RTL_LOCALE = {
    ...DEFAULT_LOCALE,
    direction: 'rtl' as const,
    roleNameUser: 'أنت',
    roleNameAssistant: 'المساعد',
  };
  let rtl = false;
  function toggleLocale(): void {
    rtl = !rtl;
    if (rtl) AparteConfig.setLocale(RTL_LOCALE);
    else AparteConfig.resetLocale();
  }

  const chat = createAparteChat();
  const { messages } = chat;
  let comp: AparteChat | null = null;
  $: chat.connect(comp);

  function handleMessagesChange(e: CustomEvent) {
    chat.onMessagesChange(e.detail);
  }

  let apiKey = localStorage.getItem(KEY_STORAGE) ?? '';
  function onKeyChange() {
    const value = apiKey.trim();
    if (value) localStorage.setItem(KEY_STORAGE, value);
    else localStorage.removeItem(KEY_STORAGE);
  }

  const chips = [
    { label: 'What is aparté?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
  ];
</script>

<div class="app">
  <header class="topbar">
    <div class="brand">aparté <span>· svelte</span></div>
    <input
      class="key"
      type="password"
      autocomplete="off"
      spellcheck="false"
      placeholder="OpenRouter API key — optional, stays in your browser"
      bind:value={apiKey}
      on:change={onKeyChange}
    />
  </header>

  <AparteChat
    bind:this={comp}
    messages={$messages}
    on:messagesChange={handleMessagesChange}
    centerWhenEmpty
    attachments
    placeholder="Ask anything…"
  >
    <div slot="empty-state" class="welcome">
      <h2>Start a conversation</h2>
      <div class="suggestions">
        {#each chips as c (c.label)}
          <button class="chip" on:click={() => sendPrompt(c.prompt)}>{c.label}</button>
        {/each}
      </div>
    </div>
    <!-- Two children, and the placement is the DOM order: the second one carries
                     margin-inline-start:auto, which pushes it -- logically, so it follows
                     the reading direction -- to the end of the row.
         `svelte:fragment` projects both without a wrapper element, so the row's own
         flex layout is what positions them. -->
    <svelte:fragment slot="toolbar">
      <button class="chip" on:click={toggleLocale}>{rtl ? 'English' : 'العربية'}</button>
      <AparteUi name="aparte-model-selector" props={{ 'auto-select': true, persist: true, searchable: true, style: 'margin-inline-start:auto' }} />
    </svelte:fragment>
  </AparteChat>
</div>
