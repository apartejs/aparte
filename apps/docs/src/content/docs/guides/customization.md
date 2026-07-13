---
title: Customization
description: Replace any region's markup, add action-bar buttons, render your own segment types, and swap icons — all without forking the components.
sidebar:
  order: 3
---

[Theming](/guides/theming) covers the *look* through CSS variables. This page is the
*structure and behaviour*: when a colour isn't enough — a custom typing indicator,
your own attachment chip, an avatar, extra buttons, a brand-new block type — you reach
for **render hooks** and the **action registry**.

Everything here goes through the global `AparteConfig` (or a scoped instance — see
[Per-instance config](#per-instance-config)). Nothing requires forking a component.

```ts
import { AparteConfig } from '@aparte/core';
```

## Render hooks

A render hook replaces one region's markup. Each returns **`string | HTMLElement`** —
return a string for simple markup (inserted as `innerHTML`), or an `HTMLElement` to
attach your own listeners/framework nodes with no `innerHTML` XSS surface.

| Hook | Replaces | Receives |
| --- | --- | --- |
| `setStatusRenderer` | the typing indicator | `(text)` |
| `setErrorRenderer` | an error segment | `({ message, … })` |
| `setAttachmentRenderer` | an attachment chip | `(attachment)` |
| `setSiblingNavRenderer` | the branch picker `‹ 1/2 ›` | `({ count, index })` |
| `setBubbleShellRenderer` | the whole bubble shell | `(ctx)` |

```ts
AparteConfig.setStatusRenderer((text) => `<div class="my-typing">${text}…</div>`);

AparteConfig.setErrorRenderer(({ message }) => {
  const el = document.createElement('div');
  el.className = 'my-error';
  el.textContent = message;      // textContent → no interpolation XSS
  return el;
});

AparteConfig.setAttachmentRenderer((att) => `<span class="my-chip">${att.name}</span>`);
```

Pass `null` to any setter to restore the default.

## Avatars

There's no message avatar by default — the slot only appears once you provide one. The
avatar provider is **imperative**: you get the already-sized `.aparte-avatar` host and
fill it. Return an optional cleanup function for live components.

```ts
AparteConfig.setAvatarProvider({
  render(role, host) {
    host.textContent = role === 'assistant' ? '✦' : '🙂';
    // return () => { /* dispose a mounted component */ };
  },
});
```

## Action-bar buttons

Buttons on the message bubble **and** the composer come from **one registry**, keyed by
zone. Add your own with `registerAction`:

```ts
AparteConfig.registerAction({
  id: 'share',
  icon: '<svg>…</svg>',          // raw HTML if it starts with '<', else an icon key
  label: 'Share',
  zones: ['bubble'],             // 'bubble' | 'composer' | both
  bubble: { roles: ['assistant'] },
});
```

Clicks are **declarative** — they emit `aparte:action`, so you handle them in one place:

```ts
document.addEventListener('aparte:action', (e) => {
  const { actionId, zone, messageId, role } = e.detail;
  if (actionId === 'share') {/* … */}
});
```

- `zones` decides where it shows; `composer: { position: 'left' | 'right' }` and
  `bubble: { roles: [...] }` refine placement; `order` sorts custom actions.
- An `onClick(event)` callback is optional and fires alongside the event.
- Hide/show at runtime with `AparteConfig.setActionHidden(id, hidden)`.
- The **built-in** bubble actions (copy / retry / edit / feedback) are toggled per role
  with `AparteConfig.setBubbleActions({ … })`.

## Custom segment types

Streamed replies are split into typed **segments** (text, code, thinking, terminal, …).
Register a renderer to add your own type — a chart, a map, a form:

```ts
import { registerSegmentRenderer } from '@aparte/core';

registerSegmentRenderer({
  type: 'chart',
  render(segment) {
    const el = document.createElement('div');
    el.className = 'my-chart';
    // build from segment data…
    return el;                    // string or HTMLElement
  },
});
```

## Icons

Every icon ships as a zero-dependency inline SVG. Override any of them — with an SVG,
an icon-font element, an emoji, or an `<img>` (the value is treated as trusted markup):

```ts
AparteConfig.setIconProvider({
  copy: () => '<svg>…</svg>',
  send: () => '<i class="fa fa-paper-plane"></i>',
});
```

You only override the keys you pass; the rest keep their defaults.

## Content providers (opt-in)

Core is zero-dependency by default, so Markdown and syntax highlighting are **off**
until you inject a renderer — keeping the bundle honest:

```ts
import { marked } from 'marked';
import { codeToHtml } from 'shiki';

AparteConfig.setMarkdownProvider((raw) => marked.parse(raw) as string);
AparteConfig.setHighlightProvider((code, lang) => codeToHtml(code, { lang, theme: 'dracula' }));
```

## Per-instance config

`AparteConfig` is global — right for the common one-chat-per-app case. To run several
independently-customized chats on one page, attach an instance config to each chat's
root; every `<aparte-*>` inside resolves the nearest boundary and falls back to global.

```ts
import { AparteConfigClass, attachConfig } from '@aparte/core';

const support = new AparteConfigClass();
support.setStatusRenderer((t) => `<em>${t}</em>`);
attachConfig(document.querySelector('#support-chat')!, support);
```

:::note
An instance config starts from the built-in defaults — it does **not** inherit
providers registered on the global `AparteConfig`. Register what each instance needs on
that instance.
:::
