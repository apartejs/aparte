<script lang="ts">
  // Runes mode, on purpose. This example exists to prove the wrapper on Svelte 5, and
  // it used to be Svelte 4 syntax compiled in legacy mode — `export let`, `$:`, `on:` —
  // so nothing in it exercised what defines Svelte 5. A single `$state` switches the
  // file to runes mode; the rest follows: `$effect` for the store connection, callback
  // props instead of `on:` on the component, `onclick` instead of `on:click`.
  import { AparteChat, AparteUi, createAparteChat } from '@aparte/svelte';
  import type { AparteMessage } from '@aparte/core';
  import { sendPrompt } from './aparte';

  const chat = createAparteChat();
  const { messages } = chat;
  let comp: AparteChat | null = $state(null);
  $effect(() => { chat.connect(comp); });

  const chips = [
    { label: 'What is aparté?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
  ];
</script>

<div class="app">
  <header class="topbar">
    <div class="brand">aparté <span>· svelte 5</span></div>
  </header>

  <AparteChat
    bind:this={comp}
    messages={$messages}
    onmessagesChange={(m: AparteMessage[]) => chat.onMessagesChange(m)}
    centerWhenEmpty
    attachments
    placeholder="Ask anything…"
  >
    <div slot="empty-state" class="welcome">
      <h2>Start a conversation</h2>
      <div class="suggestions">
        {#each chips as c (c.label)}
          <button type="button" class="chip" onclick={() => sendPrompt(c.prompt)}>{c.label}</button>
        {/each}
      </div>
    </div>
    <svelte:fragment slot="toolbar">
      <AparteUi name="aparte-model-selector" props={{ 'auto-select': true, persist: true, searchable: true, style: 'margin-inline-start:auto' }} />
    </svelte:fragment>
  </AparteChat>
</div>
