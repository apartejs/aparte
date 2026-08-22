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

Everything here goes through `aparteGlobalConfig` (or a scoped instance — see
[Per-instance config](#per-instance-config)). Nothing requires forking a component.

```ts
import { aparteGlobalConfig } from '@aparte/core';
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
aparteGlobalConfig.setStatusRenderer((text) => `<div class="my-typing">${text}…</div>`);

aparteGlobalConfig.setErrorRenderer(({ message }) => {
  const el = document.createElement('div');
  el.className = 'my-error';
  el.textContent = message;      // textContent → no interpolation XSS
  return el;
});

aparteGlobalConfig.setAttachmentRenderer((att) => {
  const el = document.createElement('span');
  el.className = 'my-chip';
  el.textContent = att.name;     // textContent → the filename can't inject HTML
  return el;
});
```

Pass `null` to any setter to restore the default.

:::caution
A render hook that returns a **string** is inserted as HTML. Never interpolate
user- or model-supplied values into that string (`` `<span>${att.name}</span>` ``) — a
crafted filename or message becomes an XSS vector. Return a **DOM element** and set
`textContent` (as above), or escape every interpolated value. Core's built-in
renderers already do this; the trust boundary is yours the moment you return a string.
:::

### If you do return a string: `escapeHtml` and `escapeAttr`

Core exports the two escapers its own renderers use, so you don't have to write them.
**The position decides which one** — and the difference is not cosmetic:

```ts
import { aparteGlobalConfig, escapeHtml, escapeAttr } from '@aparte/core';
import type { AparteAttachment } from '@aparte/core';

aparteGlobalConfig.setAttachmentRenderer((att: AparteAttachment) => `
  <span class="my-chip" title="${escapeAttr(att.name)}">
    ${escapeHtml(att.name)}
  </span>
`);
```

- **`escapeHtml`** — for text *between* tags.
- **`escapeAttr`** — for anything *inside* an attribute value. It also encodes the
  apostrophe, which `escapeHtml` alone is not required to: a single quote is enough to
  break out of `title='…'` and add an `onerror` of its own.

Building a **CSS selector** rather than markup is a third case: use `cssEscape`, also
exported, because `querySelector` needs backslash escaping and will otherwise throw or
match the wrong node.

A gate script (`pnpm check:attr-escaping`) enforces this across the library's own
source, which is how a raw `data-role="${role}"` was found sitting one line from an
escaped sibling.

## Avatars

There's no message avatar by default — the slot only appears once you provide one. The
avatar provider is **imperative**: you get the already-sized `.aparte-avatar` host and
fill it. Return an optional cleanup function for live components.

```ts
aparteGlobalConfig.setAvatarProvider({
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
aparteGlobalConfig.registerAction({
  id: 'share',
  icon: '<svg>…</svg>',          // raw HTML if it starts with '<', else an icon key
  label: 'Share',
  zones: ['bubble'],             // 'bubble' | 'composer' | both
  bubble: { roles: ['assistant'] },
});
```

Clicks are **declarative** — they emit `aparte-action`, so you handle them in one place:

```ts
document.addEventListener('aparte-action', (e) => {
  const { actionId, zone, messageId, role } = e.detail;
  if (actionId === 'share') {/* … */}
});
```

- `zones` decides where it shows; `composer: { position: 'left' | 'right' }` and
  `bubble: { roles: [...] }` refine placement; `order` sorts custom actions.
- An `onClick(event)` callback is optional and fires alongside the event.
- Hide/show at runtime with `aparteGlobalConfig.setActionHidden(id, hidden)`.
- The **built-in** bubble actions (copy / retry / edit / feedback / info) are toggled per
  role with `aparteGlobalConfig.setBubbleActions({ … })` — see
  [What ships enabled](#what-ships-enabled) just below, because most of them are **off**
  until you ask.

## What ships enabled

The rule aparté follows: **a visible control that core cannot honour end-to-end is not
rendered by default.** A button that answers to nobody is worse than a missing feature —
the user clicks it and concludes the app is broken.

Core can copy text to the clipboard by itself, so `copy` ships on. Everything else needs
someone outside core — `AparteClient`, or your own event listener — so it waits for you to
say you're there:

| Control | Needs | Default |
| --- | --- | --- |
| `copy` | nothing (core does it) | **on** |
| `retry` | a host that re-sends (`aparte-retry`) | off |
| `edit` | a host that keeps the new text (`aparte-edit`) | off |
| `feedback` (👍/👎) | your listener (`aparte-feedback`) | off |
| `info` (ⓘ details) | your popover (`aparte-message-info`) | off |
| image-tile preview | your lightbox (`aparte-attachment-preview`) | off |
| terminal `Run` | your executor (`aparte-terminal-run`) | off |
| download on a *binary* artifact | your generator (`aparte-artifact-redownload`) | off |

Two levers, one for the action bar and one for everything else:

```ts
// You run an AparteClient, so retry and edit do something:
aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });

// You handle these events yourself:
aparteGlobalConfig.setHostHandlers({ attachmentPreview: true, terminalRun: true });
```

The **branch picker** `‹ 1/2 ›`, the waiting indicator, the stop button and the model
selector are all in the first category — core honours them itself, so they need no
declaration (and the picker hides itself as soon as a message has no sibling left).

Nothing is removed by these flags: the events are unchanged and always public. An
undeclared affordance simply isn't offered — and an undeclared image tile isn't even
signalled as clickable (no `role="button"`, no tab stop, no pointer cursor), because
half-signalling is the same lie in a quieter voice.

`aparte-send` is the exception that proves the rule: with no host, nothing answers a send
either — but that's the primary function, the failure is immediate and it's the developer,
not the user, who sees it.

The **tool-approval gate** (Approve / Reject on a `tool_call` segment) needs no declaration
either, for a different reason: it renders only while the segment says
`status: 'awaiting-approval'`, and only a loop that is actually waiting for the verdict sets
that. The affordance declares itself. A `terminal` segment is the opposite — a model
narrating a command doesn't mean anybody in the page can run it, which is why `Run` waits for
`terminalRun`.

:::tip[An explicit list is its own opt-in]
`setBubbleActions({ assistant: ['copy', 'retry', 'info'] })` renders exactly those, in that
order, whatever the flags say. Naming a button in a per-role list *is* declaring it.
:::

Defaults are readable at runtime — `APARTE_DEFAULT_BUBBLE_ACTIONS` and `APARTE_DEFAULT_HOST_HANDLERS` are
exported from `@aparte/core`, so you never hard-code them.

## The composer toolbar

The composer has a **bottom row** — the strip a mode picker, a model selector or a token
counter belongs in, rather than a bar of your own floating below the chat. It is an
element, `<aparte-composer-toolbar>`, and it is the same name in vanilla and in every
wrapper.

**Placement is the DOM order.** There is no left/center/right slot: put your controls in
the order you want them, and push one — with everything after it — to the end with
`margin-inline-start: auto`. That is a *logical* property, so the row reads correctly in a
right-to-left locale without you doing anything: the composer mirrors the locale's reading
direction onto itself, and the push follows.

The row is **not** part of the default `<aparte-chat>` shell. Nothing is drawn until you
put something in it, and an empty row draws no separator either.

```html
<aparte-chat center-empty style="height: 600px">
  <aparte-chat-viewport></aparte-chat-viewport>

  <aparte-composer>
    <div class="aparte-composer-shell">
      <div class="aparte-composer-row">
        <aparte-composer-input style="flex: 1"></aparte-composer-input>
        <aparte-composer-send></aparte-composer-send>
      </div>

      <aparte-composer-toolbar>
        <my-mode-picker></my-mode-picker>
        <aparte-model-selector style="margin-inline-start: auto"></aparte-model-selector>
      </aparte-composer-toolbar>
    </div>
  </aparte-composer>
</aparte-chat>
```

(`<aparte-model-selector>` comes from
[`@aparte/plugin-model-selector`](/plugins/model-selector/); anything of yours works just
as well.)

The wrappers render the element for you as soon as you fill their **one** `toolbar` slot:

```tsx
<AparteChat
  messages={chat.messages}
  onMessagesChange={chat.setMessages}
  toolbar={<>
    <ModePicker value={mode} onChange={setMode} />
    <ModelSelector style={{ marginInlineStart: 'auto' }} />
  </>}
/>
```

| Wrapper | How you fill it |
| --- | --- |
| React | `toolbar={…}` |
| Vue | `<template #toolbar>` |
| Svelte | `<svelte:fragment slot="toolbar">` — a fragment projects several nodes with no wrapper element |
| Angular | `slot="toolbar"` on each projected node |

A second slot sits **between the transcript and the composer** — `aboveComposer` in React,
`above-composer` elsewhere — for a banner, a suggestion row or a disclaimer. Same rule:
nothing is rendered until you fill it.

The full list, with every framework's syntax side by side, is generated from the wrapper
source: [Wrapper slots](/reference/wrappers/).

:::note[Upgrading from footerLeft / footerCenter / footerRight]
Those three are gone. Pass one `toolbar` instead and order your controls yourself; a
control that used to be in the right-hand slot gets `margin-inline-start: auto`. The
positional names could not survive a right-to-left locale, and no other chat library
exposes them — MUI X and Loquix both call this row the toolbar too.
:::

## The waiting state

While a reply is in flight and the bubble has nothing in it yet, the bubble shows a
**built-in indicator** — animated dots plus a screen-reader label taken from
`locale.typing`, alongside the `aria-busy` the streaming state already sets. No wiring:
it behaves the same in a plain `<aparte-chat>`, in the four wrappers, and when you drive
your own loop. It retires itself as soon as there is content or a segment.

A bubble is considered in flight when `isAwaitingReply(message)` says so: either the
message states it (`status: 'streaming' | 'pending'`), or it is an **assistant message
with no `status` at all and nothing in it** — the empty shell a token stream is about to
fill. Only silence is interpreted; an explicit status is believed, so a deliberately
empty *finished* message needs `status: 'completed'` (otherwise it waits forever).

Restyle it with `--aparte-waiting-height` / `--aparte-waiting-dot-gap` and the shared
`--aparte-status-color` / `--aparte-status-dot-size` (see [Theming](/guides/theming/)); it
already honours `prefers-reduced-motion`.

:::note[`<aparte-chat-status>` is yours]
The separate status element — and the wrappers' `isTyping` / `typingText` props — is **not**
driven by the library: it is the channel for **your** status ("indexing your files",
"searching the web"). Two indicators for the same moment would just be noise, so the
built-in one lives in the bubble and that one stays yours. `setStatusRenderer` replaces its
markup.
:::

## Custom bubbles

Replacing the whole bubble has two levels:

- **`setBubbleShellRenderer`** (above) keeps the native `<aparte-chat-bubble>` and swaps
  its inner structure. The machinery — action bar, streaming pushes, segments — keeps
  working, as long as your shell carries the region hooks.
- **Your own element per message** (`renderBubble` in React, the `bubble` slot in
  Vue/Svelte, `[bubbleTemplate]` in Angular) replaces the element itself. In a wrapper
  that node is driven by the **reactive message list**: re-render from `message.content`
  and `message.segments` — during streaming they update live, no imperative interface to
  implement.

In **raw core** there is no reactive list, so a replacement element opts into the
imperative pushes instead: give it `data-aparte-bubble` and `message-id="…"`, and the
viewport will call `appendToken` / `appendToSegment` / `updateMessage` on it exactly as it
does on the native bubble.

```html
<!-- raw core: a custom element that still receives live streaming -->
<my-bubble data-aparte-bubble message-id="m-42"></my-bubble>
```

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
aparteGlobalConfig.setIconProvider({
  copy: () => '<svg>…</svg>',
  send: () => '<i class="fa fa-paper-plane"></i>',
});
```

You only override the keys you pass; the rest keep their defaults. The inline **message
editor**'s save/cancel buttons use the `check` and `close` keys, so they follow your
provider too; their colours are the `--aparte-success` (save) and `--aparte-error` (cancel)
CSS variables.

## Content providers (opt-in)

Core is zero-dependency by default, so Markdown and syntax highlighting are **off**
until you inject a renderer — keeping the bundle honest:

```ts
import { aparteGlobalConfig } from '@aparte/core';
import { marked } from 'marked';
import { codeToHtml } from 'shiki';

aparteGlobalConfig.setMarkdownProvider((raw) => marked.parse(raw) as string);
aparteGlobalConfig.setHighlightProvider((code, lang) => codeToHtml(code, { lang, theme: 'dracula' }));
```

## Per-instance config

`aparteGlobalConfig` is shared page-wide — right for the common one-chat-per-app case. To run several
independently-customized chats on one page, attach an instance config to each chat's
root; every `<aparte-*>` inside resolves the nearest boundary and falls back to global.

```ts
import { AparteConfig, attachConfig } from '@aparte/core';

const support = new AparteConfig();
support.setStatusRenderer((t) => `<em>${t}</em>`);
attachConfig(document.querySelector('#support-chat')!, support);
```

:::note
An instance config starts from the built-in defaults — it does **not** inherit
providers registered on `aparteGlobalConfig`. Register what each instance needs on
that instance.
:::
