# @aparte/vue

The **Vue AI chat component** of [aparté](https://github.com/apartejs/aparte) — an ergonomic
`<AparteChat>` (Vue 3.5+) plus composables (`useAparteChat`, `useAparteClient`, `useConversationManager`) over the
framework-agnostic web components in `@aparte/core`.

```bash
npm install @aparte/vue @aparte/core vue
```

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
    @messages-change="chat.onMessagesChange"
  />
</template>
```

The user's message is appended automatically on send — don't add it yourself. `@message-sent` is
optional and only for side-effects (scroll, analytics).

`@aparte/core` and `vue` are **peer dependencies**.

Every `<aparte-*>` tag is declared through Vue's `GlobalComponents`, so `vue-tsc` checks its
attributes in any template. `<AparteUi name="my-widget" />` remains for an element aparté does not
define.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
