---
title: Svelte AI chat component
description: The @aparte/svelte wrapper — an ergonomic <AparteChat> component plus stores over the aparté web components.
sidebar:
  order: 4
  label: Svelte
---

`@aparte/svelte` wraps `@aparte/core` for Svelte 4 **and 5**: an ergonomic `<AparteChat>` component, store
factories for state and the client, and a generic `<AparteUi>` escape hatch.

```bash
npm install @aparte/svelte @aparte/core svelte
```

`@aparte/core` and `svelte` are **peer dependencies**.

:::caution[On the server]
This wrapper carries **no** server guard. Under SvelteKit, keep the import on the client — a custom element extends `HTMLElement` and cannot be constructed during an SSR pass. `@aparte/core` itself imports cleanly on a server through its DOM-free entry: see [On the server](/frameworks/elements/#on-the-server).
:::



## `<AparteChat>` + `createAparteChat`

The `createAparteChat` store factory owns the `messages` store and mirrors the imperative API, so you
bind the store and connect the component with `bind:this`:

```svelte
<script lang="ts">
  import { AparteChat, createAparteChat, type AparteChatImperativeApi } from '@aparte/svelte';
  import '@aparte/core/styles.css';

  const chat = createAparteChat();
  const { messages } = chat;
  let comp: AparteChatImperativeApi | null = null;
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

Slots are named slots: `empty-state`, `composer`, `above-composer`,
`toolbar` (the composer's bottom row — mode picker, model selector: see
[The composer toolbar](/guides/customization/#the-composer-toolbar) for an example; use
`<svelte:fragment slot="toolbar">` to project several nodes), and
the `bubble` slot (`<div slot="bubble" let:message>`) for a fully custom bubble. Every imperative
method (streaming, branch/edit, `scrollToBottom`) is mirrored on the `chat` store and reachable via
`bind:this`.

The other five are `on:action`, `on:messagesChange`, `on:messageAppended`, `on:typingChange` and `on:conversationCreated`. Svelte re-wraps every payload in a `CustomEvent`, so read it from `event.detail` — the table with all four frameworks side by side is generated from the wrapper source: [Wrapper surface](/reference/wrappers/#callbacks).

## Wiring a real model

The wrapper is **provider-agnostic**. Register a provider + transport once (see
[Providers](/providers/)) and start an `AparteClient` with `createAparteClient` — it bridges composer
sends to the model:

```svelte
<script lang="ts">
  import { AparteChat, createAparteChat, createAparteClient, type AparteChatImperativeApi } from '@aparte/svelte';
  import { aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';
  import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';

  aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
  aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

  const chat = createAparteChat();
  createAparteClient();          // streams replies from the configured provider
  const { messages } = chat;
  let comp: AparteChatImperativeApi | null = null;
  $: chat.connect(comp);
</script>

<AparteChat bind:this={comp} messages={$messages} on:messagesChange={(e) => chat.onMessagesChange(e.detail)} />
```

Pass a per-instance `config` prop to scope providers/transport to a single `<AparteChat>` instead of
`aparteGlobalConfig`.

:::note
`createAparteClient` accepts the full `AparteClientOptions`. To drive the chat with the **standalone
agent loop** instead of core's inline one, inject it:
`createAparteClient({ streamRunner: runStreamAgent })` from [`@aparte/engine`](/guides/engine/) — an
optional swap-in, not required. With the client mounted, switch the retry/edit buttons on —
`aparteGlobalConfig.setBubbleActions({ retry: true, edit: true })`; they ship off because without a
host they do nothing (see [What ships enabled](/guides/customization/#what-ships-enabled)).
For file uploads add the `attachments` prop (off by default) —
see [Attachments](/guides/attachments/).
:::

## Any aparté element: typed in the markup

The `aparte-*` tags are declared through `SvelteHTMLElements`, so `svelte-check` covers both their
attributes and their `on:` handlers — no `AparteUi` needed:

```svelte
<aparte-select
  searchable=""
  placeholder="Pick a model"
  on:aparte-select-change={(e) => use(e.detail.value)}
>
  <aparte-option value="gpt-4o-mini">GPT-4o mini</aparte-option>
</aparte-select>
```

Presence attributes take `''` to set and `null` to remove, never `false` — Svelte stringifies what it
sets on a custom element, so `searchable={false}` would render `searchable="false"` and an element
testing `hasAttribute` reads that as on. The rules and the full set are on
[Placing elements, typed](/frameworks/elements/).

:::note[An element from a plugin, or one of your own]
This typing covers `@aparte/core`'s elements — the ones the wrapper depends on. An element
from a plugin (`aparte-model-selector`, from
[`@aparte/plugin-model-selector`](/plugins/model-selector/)) or one of your own is typed by
**whoever owns it**, never by us: a third-party plugin's author cannot add a line to core,
so shipping typing for our own plugins would privilege our packages over theirs.

See [your own element](/frameworks/elements/#your-own-element-or-a-plugins) for the two
mechanisms — both are the same amount of work for us as for you.
:::

## Any OTHER element: `<AparteUi>`

For an element aparté does not define — one of yours, or a third party's:

```svelte
<script lang="ts">
  import { AparteUi } from '@aparte/svelte';
</script>

<AparteUi
  name="my-token-counter"
  props={{ 'data-budget': '8000' }}
  on:elementEvent={(e) => console.log(e.detail.type, e.detail.detail)}
/>
```

It mounts any tag name, which is what a foreign element needs and what aparté's own no longer do.

## Also exported

- `createConversationManager` — Svelte stores over the core `AparteConversationManager` (list / create /
  archive), for a multi-conversation sidebar.
