---
title: React
description: The @aparte/react wrapper — an ergonomic <AparteChat> component plus hooks over the aparté web components.
sidebar:
  order: 2
---

`@aparte/react` wraps `@aparte/core` for React 18/19: an ergonomic `<AparteChat>` component, hooks
for state and the client, and a generic `<AparteUi>` escape hatch.

```bash
npm install @aparte/react @aparte/core react react-dom
```

`@aparte/core`, `react` and `react-dom` are **peer dependencies**.

## `<AparteChat>` + `useAparteChat`

The `useAparteChat` hook owns the message state and the component ref, so you just spread them:

```tsx
import { AparteChat, useAparteChat } from '@aparte/react';
import '@aparte/core/styles.css';

export function Chat() {
  const chat = useAparteChat();
  return (
    <AparteChat
      ref={chat.ref}
      messages={chat.messages}
      onMessagesChange={chat.setMessages}
      emptyState={<p>Ask me anything…</p>}
      centerWhenEmpty
    />
  );
}
```

The user's message is appended to the thread **automatically** on send — don't add it yourself.
`onMessageSent` is optional and fires *after* that append, for side-effects only (scroll, analytics,
a backend call).

Slots are plain props: `emptyState`, `composer`, `aboveComposer`, `footerLeft/Center/Right`, and
`renderBubble` for a fully custom bubble. The imperative handle (`chat.ref`) exposes streaming,
branch/edit and `scrollToBottom`.

## Wiring a real model

The wrapper is **provider-agnostic**. Register a provider + transport once (see
[Providers](/providers/)) and mount an `AparteClient` with `useAparteClient` — it bridges composer
sends to the model:

```tsx
import { AparteConfig, DirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { useAparteClient } from '@aparte/react';

AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
AparteConfig.setTransport(new DirectTransport({ byok: true }));

function Chat() {
  useAparteClient();           // streams replies from the configured provider
  // …<AparteChat /> as above
}
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

For an `<aparte-*>` element without a dedicated component, mount it generically:

```tsx
import { AparteUi } from '@aparte/react';

<AparteUi name="aparte-model-selector" props={{ placeholder: 'Ask…', '--glow-speed': '4s' }} onElementEvent={onEvent} />
```

## Also exported

- `useConversationManager` — React-state view over the core `ConversationManager` (list / create /
  archive), for a multi-conversation sidebar.
