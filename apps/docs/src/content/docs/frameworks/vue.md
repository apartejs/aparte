---
title: Vue
description: The @aparte/vue wrapper — an ergonomic <AparteChat> component plus composables over the aparté web components.
sidebar:
  order: 3
---

`@aparte/vue` wraps `@aparte/core` for Vue 3: an ergonomic `<AparteChat>` component, composables for
state and the client, and a generic `<AparteUi>` escape hatch.

```bash
npm install @aparte/vue @aparte/core vue
```

`@aparte/core` and `vue` are **peer dependencies**.

## `<AparteChat>` + `useAparteChat`

The `useAparteChat` composable owns the `messages` ref and the component ref, so you bind them and
skip the manual `@messages-change` → `messages` round-trip:

```vue
<script setup lang="ts">
import { AparteChat, useAparteChat, type AparteSendEventDetail } from '@aparte/vue';
import '@aparte/core/styles.css';

const chat = useAparteChat();

function onSend(e: AparteSendEventDetail) {
  chat.appendMessage({ id: crypto.randomUUID(), role: 'user', content: e.content, timestamp: e.timestamp });
}
</script>

<template>
  <AparteChat
    :ref="chat.chatRef"
    :messages="chat.messages.value"
    center-when-empty
    @messages-change="chat.onMessagesChange"
    @message-sent="onSend"
  >
    <template #empty-state><p>Ask me anything…</p></template>
  </AparteChat>
</template>
```

Slots are named slots: `empty-state`, `composer`, `above-composer`, `footer-left/center/right`, and
the scoped `bubble` slot (`#bubble="{ message }"`) for a fully custom bubble. The imperative handle
(`chat.chatRef`) exposes streaming, branch/edit and `scrollToBottom` — also available as plain
methods straight off the `chat` object.

## Wiring a real model

The wrapper is **provider-agnostic**. Register a provider + transport once (see
[Providers](/providers/)) and mount an `AparteClient` with `useAparteClient` — it bridges composer
sends to the model:

```vue
<script setup lang="ts">
import { AparteConfig, DirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { useAparteChat, useAparteClient } from '@aparte/vue';

AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
AparteConfig.setTransport(new DirectTransport({ byok: true }));

const chat = useAparteChat();
useAparteClient();           // streams replies from the configured provider
</script>

<template>
  <AparteChat :ref="chat.chatRef" :messages="chat.messages.value" @messages-change="chat.onMessagesChange" />
</template>
```

Pass a per-instance `config` prop to scope providers/transport to a single `<AparteChat>` instead of
the global `AparteConfig`.

:::note
`useAparteClient` accepts the full `AparteClientOptions`. To drive the chat with the **standalone
agent loop** instead of core's inline one, inject it:
`useAparteClient({ streamRunner: runStreamAgent })` from [`@aparte/engine`](/guides/engine/) — an
optional swap-in, not required. File uploads work through the composer — see
[Attachments](/guides/attachments/).
:::

## Any element: `<AparteUi>`

For an `<aparte-*>` element without a dedicated component, mount it generically. It forwards the
interactive aparté events by default; pass `:events` to listen to others:

```vue
<script setup lang="ts">
import { AparteUi } from '@aparte/vue';
</script>

<template>
  <AparteUi
    name="aparte-chat-input"
    :props="{ placeholder: 'Ask…', '--glow-speed': '4s' }"
    @element-event="(e) => console.log(e.type, e.detail)"
  />
</template>
```

## Also exported

- `useConversationManager` — Vue-reactive view over the core `ConversationManager` (list / create /
  archive), for a multi-conversation sidebar.
