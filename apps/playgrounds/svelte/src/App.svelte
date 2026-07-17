<script lang="ts">
  import { AparteChat, AparteUi, createAparteChat } from '@aparte/svelte';
  import { KEY_STORAGE, sendPrompt } from './aparte';

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
    <div slot="footer-right">
      <AparteUi name="aparte-model-selector" props={{ 'auto-select': true, persist: true, searchable: true }} />
    </div>
  </AparteChat>
</div>
