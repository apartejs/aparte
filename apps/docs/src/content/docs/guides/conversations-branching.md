---
title: Conversations & branching
description: Retrying an answer forks the conversation into a branch instead of overwriting it — with a built-in ‹ 1/2 › picker to move between versions. Editing a user message updates it in place and regenerates what follows.
sidebar:
  order: 4
---

A conversation in aparté isn't a flat list — it's a **tree**. When you **retry** an answer,
aparté doesn't overwrite the old one: it adds a **sibling branch**, so every version is kept
and navigable. The **active path** (root → leaf) is what's rendered; a built-in **‹ 1/2 ›**
picker moves between siblings.

```
user: "Explain closures"
├─ assistant: "First answer…"     ‹ 1/2 ›
└─ assistant: "Regenerated…"   ← active
```

**Editing** a user message is different — it updates the message in place and regenerates
what follows (it does *not* keep the old version as a branch). See
[Editing a user message](#editing-a-user-message) below.

## Retry creates branches

The built-in **retry** bubble action emits the public event `aparte:retry`. Handling it
creates a new sibling of the answer — a fresh branch under the same parent, with the old
answer kept.

The **branch picker and its navigation are built in**: as soon as a message has more than
one sibling, the bubble renders `‹ 1/2 ›`, and its prev/next buttons switch the active
branch for you (via `aparte:branch-navigate`, which the viewport handles). You never wire
navigation yourself.

## Editing a user message

The **edit** bubble action opens an inline editor in place of the message text. It's the
**same input as the composer** (`<aparte-composer-input>`), so it behaves identically —
autosize, IME, paste, and the same keys:

- **Enter** saves · **Shift+Enter** inserts a newline · **Esc** cancels.

Saving emits `aparte:edit` with `{ messageId, content, targetId }`. Unlike retry, the edit
**does not branch**: the user message's text is replaced in place and the answer(s) below it
are regenerated (the previous response is cleared, not kept as a sibling). With
[`AparteClient`](/guides/transports) this is automatic; to wire it yourself, see
[the manual way](#the-manual-way) below.

:::tip[Edit is just an event]
The in-place replace is only `AparteClient`'s **default** — the bubble merely emits
`aparte:edit`, so the handler owns the behaviour. Handle the event yourself to do otherwise;
to keep the old version (ChatGPT-style branch-on-edit) you'd build that tree yourself, e.g.
via [`exportTree()` / `importTree()`](#persistence) — note `addSiblingOf` on a user message
adds a child, not a sibling, so it won't create the alternate user turn on its own.
:::

## The automatic way — `AparteClient`

If you drive the chat with [`AparteClient`](/guides/transports), retry and edit are
**handled out of the box**: the client listens for `aparte:retry` / `aparte:edit`. On
**retry** it creates the sibling branch and re-streams the new answer into it; on **edit**
it updates the user message in place, clears the old answer, and re-streams a fresh one.
Nothing to write.

## The manual way

Without the client (e.g. a custom loop), handle `aparte:retry` yourself. Create the
sibling with **`viewport.addSiblingOf(messageId, newMessage)`** — it returns the new
message's id — then stream into it:

```ts
const viewport = document.querySelector('aparte-chat-viewport'); // or chat.viewport

document.addEventListener('aparte:retry', (e) => {
  const id = viewport.addSiblingOf(e.detail.messageId, {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  });

  // Stream your model's new answer into the branch:
  for await (const token of yourModelStream) viewport.appendToken(id, token);
  viewport.completeMessage(id);
});
```

The new branch becomes active and the `‹ 1/2 ›` picker appears automatically. The old
answer isn't lost — it's the other sibling, one click away.

:::note
`addSiblingOf` is role-aware: on an **assistant** message it creates a sibling under the
same parent (the new response *replaces* the old on the active path); on a **user**
message it creates a child (a new turn follows it).
:::

For **edit**, handle `aparte:edit`: overwrite the user message, drop its now-stale answer,
and stream a fresh one. This mirrors what `AparteClient` does — an in-place update, not a
branch:

```ts
document.addEventListener('aparte:edit', (e) => {
  const { messageId, content } = e.detail;

  viewport.updateMessage(messageId, { content });   // replace the user text in place
  viewport.truncateResponsesAfter(messageId);        // drop the previous answer(s)

  const id = viewport.addSiblingOf(messageId, {       // a fresh answer under the edited turn
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  });

  for await (const token of yourModelStream) viewport.appendToken(id, token);
  viewport.completeMessage(id);
});
```

## Persistence

The whole tree — every branch, not just the active path — round-trips through the
viewport as a plain, serializable object. **`exportTree()` just hands you the data; where
it lives is up to you** — the browser in a front-only app, or your own backend otherwise:

```ts
const tree = viewport.exportTree();   // plain object — persist it however you like

// front-only (local-first):
localStorage.setItem('chat', JSON.stringify(tree));
// or with a backend:
await fetch('/api/chats/42', { method: 'PUT', body: JSON.stringify(tree) });

// later, to restore:
viewport.importTree(tree);
```

For multi-conversation storage (list, switch, delete — against localStorage, IndexedDB,
or your API), core also ships a `ConversationManager` + a storage-adapter contract — a
topic of its own.

## Customizing the picker

The `‹ 1/2 ›` control is a render hook: swap it for your own markup with
`AparteConfig.setSiblingNavRenderer(({ count, index }) => …)`. See
[Customization](/guides/customization#render-hooks).

---

See the generated [Elements reference](/reference/api) for the exact signatures of
`addSiblingOf`, `navigateBranch`, `exportTree` and `importTree` on
`<aparte-chat-viewport>`.
