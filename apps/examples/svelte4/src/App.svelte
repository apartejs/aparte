<script lang="ts">
  import { AparteChat, AparteUi, createAparteChat } from '@aparte/svelte';
  import { sendPrompt } from './aparte';


  const chat = createAparteChat();
  const { messages } = chat;
  let comp: AparteChat | null = null;
  $: chat.connect(comp);

  function handleMessagesChange(e: CustomEvent) {
    chat.onMessagesChange(e.detail);
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
    <svelte:fragment slot="toolbar">
      <AparteUi name="aparte-model-selector" props={{ 'auto-select': true, persist: true, searchable: true, style: 'margin-inline-start:auto' }} />
    </svelte:fragment>
  </AparteChat>
</div>
