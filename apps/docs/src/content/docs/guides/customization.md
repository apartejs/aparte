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
| download on a *binary* artifact | your generator (`aparte-artifact-redownload`) | off |

Two levers, one for the action bar and one for everything else:

```ts
// You run an AparteClient, so retry and edit do something:
aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });

// You handle these events yourself:
aparteGlobalConfig.setHostHandlers({ attachmentPreview: true, artifactRedownload: true });
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

The **tool-approval gate** needs no declaration either, for a different reason: the
`tool_call` pill shows only that a tool is waiting, and the choices are raised at the
composer by a loop that is actually waiting for the verdict. Nothing in the transcript is
clickable, so there is no affordance there to declare — and a segment restored from
storage cannot offer a button whose listener went with the page, which is what the old
inline Approve / Reject did. The **download on a binary artifact** is the
opposite — a model producing a spreadsheet doesn't mean anything in the page can
regenerate the bytes, which is why it waits for `artifactRedownload`.

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

Streamed replies are split into typed **segments** (text, code, thinking, tool_call, …).
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

### Driving the whole registry

`registerSegmentRenderer` adds a type. Three more functions drive the registry itself,
and none of them needs an `AparteClient`:

```ts
import {
  declineDefaultRenderers,
  installDefaultRenderersOnce,
  getAllRenderers,
} from '@aparte/core';

// Draw every segment yourself: refuse the built-ins BEFORE the first bubble renders.
declineDefaultRenderers();

// …or install them lazily — this is what <aparte-chat-bubble> does on first render.
installDefaultRenderersOnce();

// Introspect the wiring. Runs in Node, with no DOM, so a test can assert your setup.
const types: readonly string[] = getAllRenderers().map((r) => r.type);
```

`declineDefaultRenderers()` is what `new AparteClient({ autoRegister: false })` calls
internally — calling it directly is the only way to say the same thing without
constructing a client, which [Bring your own loop](/guides/bring-your-own-loop/) tells you
not to do. All three take an optional trailing config, so each can be scoped to one chat
rather than the page.

### What a segment knows about itself

Every segment carries where it sits and when it happened, so you can build the chrome the
market has taught users to expect — a collapsed reasoning line with its duration, a tool
pill with how long the call took — without replacing a renderer:

| Field | |
|---|---|
| `messageId` | the message the segment belongs to |
| `index` | its position in that message's `segments[]` |
| `meta.aparte.startedAt` | epoch ms when it entered a **live** transcript |
| `meta.aparte.endedAt` | epoch ms when content **last arrived** — advances while streaming, frozen once settled |
| `meta.*` | yours: token counts, cost, anything. `updateSegment(id, { meta })` merges, so writing your own key never erases core's |

The two measurements live in `meta.aparte` rather than on the segment because **no protocol
carries a timestamp on a content block** — not Anthropic's, not OpenAI's, not the AI SDK's
parts. A span is something the client measured, so its shape says so. It is still typed
(`AparteSegmentTiming`), and namespaced under `aparte` because the rest of `meta` is yours.

Everything here is optional, and that is not hedging: it describes a lifecycle. A segment
you built by hand, or one straight out of the parser, has not been inserted yet — so it has
no start; an open segment has no end; and a segment restored from storage has neither,
because a measurement nobody took is absent rather than invented.

Read the span with **`segmentDuration(segment)`** rather than subtracting anything
yourself, ask **`isSegmentSettled(segment)`** whether the number is final, and reach for
**`segmentTiming(segment)`** when you want the two numbers themselves — all three are
exported, and all three are the rules core uses internally rather than a copy of them.
| `meta` | anything only *you* can know: token counts, cost, device |

**Core renders none of it.** It measures a duration honestly (it owns the stream) and
leaves the display to you, because the line you want says "Thought for 8s" in one product
and "8.2s · 1.2k tokens" in another:

```ts
import { getSegmentRenderer, registerSegmentRenderer, isSegmentSettled, segmentDuration } from '@aparte/core';
import type { AparteThinkingSegment } from '@aparte/core';

const builtIn = getSegmentRenderer('thinking')!;

/** A markup string back to the single root element it describes. */
function parseRoot(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.firstElementChild as HTMLElement;
}

registerSegmentRenderer<AparteThinkingSegment>({
  type: 'thinking',
  render(segment) {
    const out = builtIn.render(segment);
    // Keep the ROOT the built-in produced — do not wrap it in a div of your own.
    // The bubble finds a segment to update with `:scope > [data-segment-id="…"]`,
    // so an extra wrapper hides that attribute and every delta falls back to a
    // full re-render of the transcript instead of an in-place write.
    const host = typeof out === 'string' ? parseRoot(out) : out;
    writeDuration(host, segment);
    return host;
  },
  setup: (el, segment) => builtIn.setup?.(el, segment),
  update(el, segment) {
    builtIn.update?.(el, segment);
    // ALSO here, and this is the part that is easy to miss: a block is created
    // open and settles LATER, and a settle reaches a renderer through `update` —
    // never through a second `render`. Writing the label only in `render` leaves
    // it reading "Thinking" forever.
    writeDuration(el, segment);
  },
  // And here, for the same reason one step further out: a language switch or a new
  // icon set reaches a rendered segment through `relabel`, never through a second
  // `render`. Forward to the built-in so its own label follows, then re-apply yours.
  relabel: (el, segment) => {
    builtIn.relabel?.(el, segment);
    writeDuration(el, segment);
  },
});

function writeDuration(host: HTMLElement, segment: AparteThinkingSegment): void {
  // Two rules, both core's own, both imported rather than re-derived.
  // `isSegmentSettled` because a tool call settles by `status` and never by
  // `isStreaming`; `segmentDuration` because the bounds are optional and hand-rolled
  // truthiness checks on them are wrong at epoch 0.
  if (!isSegmentSettled(segment)) return;
  const ms = segmentDuration(segment);
  if (ms === undefined) return;
  const label = host.querySelector('.thinking-label');
  if (label) label.textContent = `Thought for ${(ms / 1000).toFixed(1)}s`;
}
```

Nothing writes `meta` — it is yours, and the imperative API already carries it. A provider
that knows what a segment cost is where those numbers come from; core has no per-segment
channel to a provider, so the write happens in your app:

```ts
import type { AparteChatImperativeApi } from '@aparte/core';

declare const chat: AparteChatImperativeApi;

// After a turn: attach what only you measured.
chat.updateSegment('seg-7', { meta: { outputTokens: 1_240, device: 'webgpu' } });

// And read it back — `getMessages()` returns the segments with everything on them.
const last = chat.getMessages().at(-1);
for (const segment of last?.segments ?? []) {
  console.info(segment.index, segment.type, segment.meta);
}
```

Two notes worth knowing before you rely on the numbers.

**`endedAt` is the last delta, not the moment someone noticed.** That is why
`isSegmentSettled` exists: during a turn the difference is a live duration that grows, and
after it, it is final. The two simpler rules are both wrong and were both tried — closing
at the end of the turn makes a reasoning block span the whole answer that followed it (2s
of thinking before a 20s reply reads "22s"), and closing when the next segment opens counts
a ten-second gap as thinking. Note also that only payload counts: collapsing a block or
writing `meta` is presentation, and does not move the end.

**A segment is finished as soon as the stream says so, not when the turn ends.** The end of
a delimited segment is in band — `</think>`, a closing fence, `</artifact>`, or the opening
of the next block — and reasoning delivered on its own channel ends when the first answer
token arrives. So `isSegmentSettled` flips *during* the turn, and your duration line is
readable while the answer is still streaming. The one case with no in-band end is a text run
that stops only because the stream stopped; there, the end of the turn really is its end.

**A segment rehydrated from your storage keeps what it was persisted with.** Core stamps on
insertion and never overwrites, so a reloaded conversation still shows the durations it
originally had.

## Defaults for a segment type

A reasoning block is **closed** unless the segment says `collapsed: false`. If your app
wants them all open, you cannot set that field: when a reply streams, *you* do not build
its segments — the parser does. There is nothing to set it on.

So the default is registered by type:

```ts
import { aparteGlobalConfig } from '@aparte/core';

// Every reasoning block in this app arrives open.
aparteGlobalConfig.setSegmentDefaults('thinking', { collapsed: false });

// Your own segment type, same call.
aparteGlobalConfig.setSegmentDefaults('my-chart', { theme: 'dark' });
```

One call keyed by type rather than one function per field — a `setThinkingOpen()` would
need a sibling the next time any type wanted a default, and the type key is a string, so
a type core has never heard of is covered by the same call.

What to expect:

- **A field the producer set always wins.** A segment carrying `collapsed: true` keeps it,
  and so does one carrying `collapsed: undefined` — an explicit `undefined` is a
  statement, not a gap.
- **Identity is never defaulted.** `id`, `type`, `messageId` and `index` are refused: a
  default `id` would hand every segment in a conversation the same one, and `index` is a
  fact about *this* insertion. A default may fill `meta`, but **not `meta.aparte`** — that
  would let an app hand itself a span it never measured.
- **Every arrival path is covered**, because the defaults are applied where a segment's
  identity is stamped: `addSegment`, the segments seeded on an `appendMessage`, and the
  framework host. Including the ones the parser produces, which is the case that needed
  it.
- **Read at insertion, then baked in.** Changing a default later does not reach segments
  already on screen — deliberately: a block the reader opened has state the data does
  not, and a retroactive default would take it away.
- **Per instance.** Each chat resolves its own config, so two chats on one page can
  default differently.

`getSegmentDefaults(type)` reads them back and `clearSegmentDefaults(type)` drops them.

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

### Keeping your own element in step

A config change is meant to reach components that are already on screen — a language
switch, a new icon set, different bubble actions. Core's own elements listen for it;
if you replace one of them, or write an element of your own that reads an icon or a
locale string, subscribe with the same hook they use:

```ts
import { subscribeConfigChange, aparteGlobalConfig } from '@aparte/core';

class MyComposerButton extends HTMLElement {
  private off: (() => void) | null = null;
  private button: HTMLButtonElement | null = null;

  connectedCallback(): void {
    this.innerHTML = '<button type="button"></button>';
    this.button = this.querySelector('button');
    this.refreshChrome();
    // A TARGETED refresh — reset the icon and the label on the button you already
    // have. A full re-render would throw away focus, listeners, a caret, or a
    // mounted preview.
    this.off = subscribeConfigChange(this, () => this.refreshChrome());
  }

  disconnectedCallback(): void {
    this.off?.();
    this.off = null;
  }

  private refreshChrome(): void {
    if (!this.button) return;
    const label = aparteGlobalConfig.t('sendButton');
    this.button.innerHTML = aparteGlobalConfig.getIcon('send');
    this.button.setAttribute('aria-label', label);
    this.button.title = label;
  }
}
```

It resolves *your* element's config on every event, so a change scoped to one chat on
a page with two of them reaches only that one — and never latches a config captured
before your element was mounted. `APARTE_CONFIG_CHANGE` is exported too, if you would
rather listen on `window` yourself.

### Three moments, not one

A renderer can be called at four moments, and forgetting one is the most common way a
custom renderer goes half-stale:

| Hook | When | Rule |
|---|---|---|
| `render` | the first time the segment appears | returns markup or an element |
| `setup` | once, straight after `render` | wire listeners here |
| `update` | a content delta, and when the segment settles | **no child node added or removed** |
| `relabel` | the config changed — a language, an icon set | same rule as `update` |

`relabel` exists because the obvious alternative does not work: re-rendering a segment
to pick up a new locale throws away state the DOM owns and the segment data does not —
a preview iframe that is running, a reasoning block the reader expanded by clicking
`<summary>`, scroll position inside a long reasoning pane, the caret in a half-typed
answer. Implement it only if your output contains text or icons that came from the
config; a renderer whose chrome is all its own data correctly leaves it out.

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
