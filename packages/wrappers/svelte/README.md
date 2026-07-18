# @aparte/svelte

Svelte 4 wrapper for [aparté](https://github.com/apartejs/aparte) — an ergonomic `<AparteChat>`
component plus stores (`createAparteChat`, `createAparteClient`, `createConversationManager`) over the
framework-agnostic web components in `@aparte/core`.

```bash
npm install @aparte/svelte @aparte/core svelte
```

```svelte
<script lang="ts">
  import { AparteChat, createAparteChat, type AparteChatInstance } from '@aparte/svelte';
  import '@aparte/core/styles.css';

  const chat = createAparteChat();
  const { messages } = chat;
  let comp: AparteChatInstance | null = null;
  $: chat.connect(comp);
</script>

<AparteChat
  bind:this={comp}
  messages={$messages}
  on:messagesChange={(e) => chat.onMessagesChange(e.detail)}
/>
```

The user's message is appended automatically on send — don't add it yourself. `on:messageSent` is
optional and only for side-effects (scroll, analytics).

`@aparte/core` and `svelte` are **peer dependencies**. For any `<aparte-*>` element without a
dedicated component, the generic `<AparteUi name="aparte-…" />` escape hatch mounts it.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
