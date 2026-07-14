---
title: Conversations & branching
description: Retrying or editing a message forks the conversation into a branch instead of overwriting it — with a built-in ‹ 1/2 › picker to move between versions.
sidebar:
  order: 4
---

A conversation in aparté isn't a flat list — it's a **tree**. When you retry an answer
or edit a message, aparté doesn't overwrite the old one: it adds a **sibling branch**, so
every version is kept and navigable. The **active path** (root → leaf) is what's rendered;
a built-in **‹ 1/2 ›** picker moves between siblings.

```
user: "Explain closures"
├─ assistant: "First answer…"     ‹ 1/2 ›
└─ assistant: "Regenerated…"   ← active
```

## Retry & edit create branches

The built-in **retry** and **edit** bubble actions emit the public events
`aparte:retry` and `aparte:edit`. Handling them creates a new sibling of the message —
a fresh branch under the same parent.

The **branch picker and its navigation are built in**: as soon as a message has more than
one sibling, the bubble renders `‹ 1/2 ›`, and its prev/next buttons switch the active
branch for you (via `aparte:branch-navigate`, which the viewport handles). You never wire
navigation yourself.

## The automatic way — `AparteClient`

If you drive the chat with [`AparteClient`](/guides/transports), retry and edit are
**branch-aware out of the box**: the client listens for `aparte:retry` / `aparte:edit`,
creates the sibling, and re-streams your model's new answer into it. Nothing to write.

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
