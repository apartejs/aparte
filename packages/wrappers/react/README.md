# @aparte/react

React 18/19 wrapper for [aparté](https://github.com/apartejs/aparte) — an ergonomic `<AparteChat>`
component plus hooks (`useAparteChat`, `useAparteClient`, `useConversationManager`) over the
framework-agnostic web components in `@aparte/core`.

```bash
npm install @aparte/react @aparte/core react react-dom
```

```tsx
import { AparteChat, useAparteChat } from '@aparte/react';
import '@aparte/core/styles.css';

function Chat() {
  const chat = useAparteChat();
  return (
    <AparteChat
      ref={chat.ref}
      messages={chat.messages}
      onMessagesChange={chat.setMessages}
      onMessageSent={(e) =>
        chat.appendMessage({ id: crypto.randomUUID(), role: 'user', content: e.content, timestamp: e.timestamp })
      }
    />
  );
}
```

`@aparte/core`, `react` and `react-dom` are **peer dependencies**. For any `<aparte-*>` element
without a dedicated component, the generic `<AparteUi name="aparte-…" />` escape hatch mounts it.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
