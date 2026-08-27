---
title: React
description: The @aparte/react wrapper — an ergonomic <AparteChat> component plus hooks over the aparté web components.
sidebar:
  order: 2
---

`@aparte/react` wraps `@aparte/core` for React 18/19: an ergonomic `<AparteChat>` component, hooks
for state and the client, typed JSX for every element, and a generic `<AparteUi>` escape hatch.

```bash
npm install @aparte/react @aparte/core react react-dom
```

`@aparte/core`, `react` and `react-dom` are **peer dependencies**.

:::note[On the server]
`AparteChat.tsx` opens with `'use client'`, so the Next App Router keeps the component out of the server pass for you. `@aparte/core` itself imports cleanly on a server through its DOM-free entry — see [On the server](/frameworks/elements/#on-the-server).
:::


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

Slots are plain props: `emptyState`, `composer`, `aboveComposer`,
`toolbar` (the composer's bottom row — mode picker, model selector: see
[The composer toolbar](/guides/customization/#the-composer-toolbar) for an example), and
`renderBubble` for a fully custom bubble — driven by the reactive `messages` list, so re-render
from `message.content` / `message.segments` and it streams live ([details](/guides/customization/#custom-bubbles)).
The imperative handle (`chat.ref`) exposes streaming, branch/edit and `scrollToBottom`.

The other five callbacks — `onAction`, `onMessagesChange`, `onMessageAppended`, `onTypingChange`, `onConversationCreated` — take the same payloads as everywhere else; the table with all four frameworks side by side is generated from this wrapper's own props: [Wrapper surface](/reference/wrappers/#callbacks).


## Wiring a real model

The wrapper is **provider-agnostic**. Register a provider + transport once (see
[Providers](/providers/)) and mount an `AparteClient` with `useAparteClient` — it bridges composer
sends to the model:

```tsx
import { aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { useAparteClient } from '@aparte/react';

aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

function Chat() {
  useAparteClient();           // streams replies from the configured provider
  // …<AparteChat /> as above
}
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
see [Attachments](/guides/attachments/).
:::

## Any aparté element: typed JSX

The `aparte-*` tags are typed JSX intrinsics as soon as you import from `@aparte/react` — nothing to
register. Attribute names are the HTML ones, and a typo or a wrong value type is a compile error:

```tsx
<aparte-select searchable="" placeholder="Pick a model">
  <aparte-option value="gpt-4o-mini">GPT-4o mini</aparte-option>
</aparte-select>
```

Presence attributes are `''`, not `true` — React stringifies what it sets on a custom element, so
`searchable={false}` would render `searchable="false"` and an element testing `hasAttribute` reads
that as on. Events reach you by ref and are typed through the DOM. The rules and the full set are on
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

<!-- doc-check: skip excerpt — `onEvent` is the reader's handler -->
```tsx
import { AparteUi } from '@aparte/react';

<AparteUi name="my-token-counter" props={{ 'data-budget': '8000' }} onElementEvent={onEvent} />
```

It mounts any tag name, which is exactly what you want for a foreign element and exactly what you do
not need for aparté's own — those are typed above.

## Also exported

- `useConversationManager` — React-state view over the core `AparteConversationManager` (list / create /
  archive), for a multi-conversation sidebar.
