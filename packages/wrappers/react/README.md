# @aparte/react

The **React AI chat component** of [aparté](https://github.com/apartejs/aparte) — an ergonomic
`<AparteChat>` (React 18/19) plus hooks (`useAparteChat`, `useAparteClient`, `useConversationManager`) over the
framework-agnostic web components in `@aparte/core`.

<a href="https://apartejs.dev/templates/assistant/"><picture><source media="(prefers-color-scheme: dark)" srcset="https://apartejs.dev/shots/chat-dark.png"><img src="https://apartejs.dev/shots/chat.png" alt="An aparté chat: the conversation list, a question, and the assistant's reply — its reasoning, a weather card and the answer — above the composer"></picture></a>

Tested in CI with React 19, and in a Next 15 App Router page rendered on the server and hydrated
with no mismatch. `<AparteToolUI name="…">` draws a tool call with your own component, with your
app's context.

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

Every element of core is also **a component** — `<AparteConversationList>`, `<AparteSelect>`,
`<AparteSplit>`… — with its properties as props and its events as `onXxx` callbacks, called with the
detail and then the event, the same under React 18 and 19:

```tsx
<AparteConversationList
  conversations={manager.activeConversations}
  active-id={manager.activeId}
  onConversationSelect={(detail) => openChat(detail.id)}
/>
```

Every `<aparte-*>` tag is a **typed JSX intrinsic** too — real attributes, checked by the compiler,
no registration. `<AparteUi name="my-widget" />` remains for an element aparté does not define.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
