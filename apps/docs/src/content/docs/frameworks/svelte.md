---
title: Svelte
description: The @aparte/svelte wrapper — an ergonomic <AparteChat> component plus stores over the aparté web components.
sidebar:
  order: 4
---

`@aparte/svelte` wraps `@aparte/core` for Svelte 4: an ergonomic `<AparteChat>` component, store
factories for state and the client, and a generic `<AparteUi>` escape hatch.

```bash
npm install @aparte/svelte @aparte/core svelte
```

`@aparte/core` and `svelte` are **peer dependencies**.

## `<AparteChat>` + `createAparteChat`

The `createAparteChat` store factory owns the `messages` store and mirrors the imperative API, so you
bind the store and connect the component with `bind:this`:

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
  centerWhenEmpty
  on:messagesChange={(e) => chat.onMessagesChange(e.detail)}
>
  <p slot="empty-state">Ask me anything…</p>
</AparteChat>
```

The user's message is appended to the thread **automatically** on send — don't add it yourself.
`on:messageSent` is optional and fires *after* that append, for side-effects only (scroll, analytics,
a backend call).

Slots are named slots: `empty-state`, `composer`, `above-composer`, `footer-left/center/right`, and
the `bubble` slot (`<div slot="bubble" let:message>`) for a fully custom bubble. Every imperative
method (streaming, branch/edit, `scrollToBottom`) is mirrored on the `chat` store and reachable via
`bind:this`.

## Wiring a real model

The wrapper is **provider-agnostic**. Register a provider + transport once (see
[Providers](/providers/)) and start an `AparteClient` with `createAparteClient` — it bridges composer
sends to the model:

```svelte
<script lang="ts">
  import { AparteChat, createAparteChat, createAparteClient, type AparteChatInstance } from '@aparte/svelte';
  import { AparteConfig, DirectTransport } from '@aparte/core';
  import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

  AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
  AparteConfig.setTransport(new DirectTransport({ byok: true }));

  const chat = createAparteChat();
  createAparteClient();          // streams replies from the configured provider
  const { messages } = chat;
  let comp: AparteChatInstance | null = null;
  $: chat.connect(comp);
</script>

<AparteChat bind:this={comp} messages={$messages} on:messagesChange={(e) => chat.onMessagesChange(e.detail)} />
```

Pass a per-instance `config` prop to scope providers/transport to a single `<AparteChat>` instead of
the global `AparteConfig`.

:::note
`createAparteClient` accepts the full `AparteClientOptions`. To drive the chat with the **standalone
agent loop** instead of core's inline one, inject it:
`createAparteClient({ streamRunner: runStreamAgent })` from [`@aparte/engine`](/guides/engine/) — an
optional swap-in, not required. File uploads work through the composer — see
[Attachments](/guides/attachments/).
:::

## Any element: `<AparteUi>`

For an `<aparte-*>` element without a dedicated component, mount it generically. It forwards the
interactive aparté events by default; pass `events` to listen to others:

```svelte
<script lang="ts">
  import { AparteUi } from '@aparte/svelte';
</script>

<AparteUi
  name="aparte-model-selector"
  props={{ placeholder: 'Ask…', '--glow-speed': '4s' }}
  on:elementEvent={(e) => console.log(e.detail.type, e.detail.detail)}
/>
```

## Also exported

- `createConversationManager` — Svelte stores over the core `ConversationManager` (list / create /
  archive), for a multi-conversation sidebar.
