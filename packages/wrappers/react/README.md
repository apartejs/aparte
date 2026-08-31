# @aparte/react

The **React AI chat component** of [aparté](https://github.com/apartejs/aparte) — an ergonomic
`<AparteChat>` (React 18/19) plus hooks (`useAparteChat`, `useAparteClient`, `useConversationManager`) over the
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
    />
  );
}
```

The user's message is appended automatically on send — don't add it yourself. `onMessageSent` is
optional and only for side-effects (scroll, analytics).

`@aparte/core`, `react` and `react-dom` are **peer dependencies**.

Every `<aparte-*>` tag is a **typed JSX intrinsic** — real attributes, checked by the compiler, no
registration. `<AparteUi name="my-widget" />` remains for an element aparté does not define.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
