---
title: Vue AI chat component
description: The @aparte/vue wrapper — an ergonomic <AparteChat> component plus composables over the aparté web components.
sidebar:
  order: 3
  label: Vue
---

`@aparte/vue` wraps `@aparte/core` for Vue 3.5+: an ergonomic `<AparteChat>` component, composables for
state and the client, and a generic `<AparteUi>` escape hatch.

```bash
npm install @aparte/vue @aparte/core vue
```

`@aparte/core` and `vue` are **peer dependencies**.

:::caution[On the server]
This wrapper carries **no** server guard. Under Nuxt, import it in a client-only context yourself — a custom element extends `HTMLElement` and cannot be constructed during an SSR pass. `@aparte/core` itself imports cleanly on a server through its DOM-free entry: see [On the server](/frameworks/elements/#on-the-server).
:::



## `<AparteChat>` + `useAparteChat`

The `useAparteChat` composable owns the `messages` ref and the component ref, so you bind them and
skip the manual `@messages-change` → `messages` round-trip:

```vue
<script setup lang="ts">
import { AparteChat, useAparteChat } from '@aparte/vue';
import '@aparte/core/styles.css';

const chat = useAparteChat();
</script>

<template>
  <AparteChat
    :ref="chat.chatRef"
    :messages="chat.messages.value"
    center-when-empty
    @messages-change="chat.onMessagesChange"
  >
    <template #empty-state><p>Ask me anything…</p></template>
  </AparteChat>
</template>
```

The user's message is appended to the thread **automatically** on send — don't add it yourself.
`@message-sent` is optional and fires *after* that append, for side-effects only (scroll, analytics,
a backend call).

Slots are named slots: `empty-state`, `composer`, `above-composer`,
`toolbar` (the composer's bottom row — mode picker, model selector: see
[The composer toolbar](/guides/customization/#the-composer-toolbar) for an example), and
the scoped `bubble` slot (`#bubble="{ message }"`) for a fully custom bubble. The imperative handle
(`chat.chatRef`) exposes streaming, branch/edit and `scrollToBottom` — also available as plain
methods straight off the `chat` object.

The six callbacks are `@message-sent`, `@action`, `@messages-change`, `@message-appended`, `@typing-change` and `@conversation-created`. Vue hands you the payload directly — the table with all four frameworks side by side is generated from the wrapper source: [Wrapper surface](/reference/wrappers/#callbacks).

## Wiring a real model

The wrapper is **provider-agnostic**. Register a provider + transport once (see
[Providers](/providers/)) and mount an `AparteClient` with `useAparteClient` — it bridges composer
sends to the model:

```vue
<script setup lang="ts">
import { aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { AparteChat, useAparteChat, useAparteClient } from '@aparte/vue';

aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

const chat = useAparteChat();
useAparteClient();           // streams replies from the configured provider
</script>

<template>
  <AparteChat :ref="chat.chatRef" :messages="chat.messages.value" @messages-change="chat.onMessagesChange" />
</template>
```

Pass a per-instance `config` prop to scope providers/transport to a single `<AparteChat>` instead of
`aparteGlobalConfig`.

:::note
`useAparteClient` accepts the full `AparteClientOptions`. To drive the chat with the **standalone
agent loop** instead of core's inline one, inject it:
`useAparteClient({ streamRunner: runStreamAgent })` from [`@aparte/engine`](/guides/engine/) — an
optional swap-in, not required. With the client mounted, switch the retry/edit buttons on —
`aparteGlobalConfig.setBubbleActions({ retry: true, edit: true })`; they ship off because without a
host they do nothing (see [What ships enabled](/guides/customization/#what-ships-enabled)).
For file uploads add the `attachments` prop (off by default) —
see [Attachments](/guides/attachments/). The `<aparte-elicitation>` presenter — what the
built-in approval gate and `requestUserInput()` ask through — renders inside the host **by
default**, as in `<aparte-chat>`; pass `:elicitation="false"` when you register a presenter of
your own. `class` and `style` fall through to the root element (`[data-aparte-chat]`), Vue's
default for a single-root component, so `<AparteChat class="flex-1 min-h-0" />` sizes the chat
column with utilities.
:::

## Any aparté element: typed in the template

The `aparte-*` tags are declared through Vue's `GlobalComponents`, so `vue-tsc` checks them in any
template once the package is imported — no `AparteUi`, no `isCustomElement` guesswork about names:

```vue
<template>
  <aparte-select
    searchable=""
    placeholder="Pick a model"
    @aparte-select-change="(e) => use(e.detail.value)"
  >
    <aparte-option value="gpt-4o-mini">GPT-4o mini</aparte-option>
  </aparte-select>
</template>
```

Presence attributes take `''` to set and `null` to remove, never `false` — Vue stringifies what it
sets on a custom element, so `:searchable="false"` would render `searchable="false"` and an element
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

```vue
<script setup lang="ts">
import { AparteUi } from '@aparte/vue';
</script>

<template>
  <AparteUi
    name="my-token-counter"
    :props="{ 'data-budget': '8000' }"
    @element-event="(e) => console.log(e.type, e.detail)"
  />
</template>
```

It mounts any tag name, which is what a foreign element needs and what aparté's own no longer do.

## Also exported

- `useConversationManager` — Vue-reactive view over the core `AparteConversationManager` (list / create /
  archive), for a multi-conversation sidebar.
