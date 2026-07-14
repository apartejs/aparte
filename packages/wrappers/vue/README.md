# @aparte/vue

Vue 3 wrapper for [aparté](https://github.com/apartejs/aparte) — an ergonomic `<AparteChat>`
component plus composables (`useAparteChat`, `useAparteClient`, `useConversationManager`) over the
framework-agnostic web components in `@aparte/core`.

```bash
npm install @aparte/vue @aparte/core vue
```

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
    @messages-change="chat.onMessagesChange"
    @message-sent="onSend"
  />
</template>
```

`@aparte/core` and `vue` are **peer dependencies**. For any `<aparte-*>` element without a dedicated
component, the generic `<AparteUi name="aparte-…" />` escape hatch mounts it.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
