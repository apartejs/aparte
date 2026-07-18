# Customizing Aparte

> **Every part is yours to replace.** Aparte ships a batteries-included chat UI, but
> every region — bubbles, the typing indicator, attachments, errors, actions — is
> replaceable without forking. This is the library's core promise.

Three primitives, repeated everywhere:

1. **Render hooks** — a function `region → string | HTMLElement`. Return a string
   for simple markup, or a ready DOM element to mount live, interactive content
   (event listeners, framework nodes) with no `innerHTML` XSS surface.
2. **DOM CustomEvents** — public, bubbling events (`aparte:action`, `aparte:retry`, …)
   so you wire behavior the same way in every framework and in vanilla.
3. **Registries** — register renderers/providers by type (segments, icons,
   markdown, …).

Styling is separate and 100% CSS variables — see [THEMING.md](./THEMING.md).

All render hooks below are **opt-in and non-breaking**: unset, you get the default.

---

## Quick reference

| Region | API | Returns |
|---|---|---|
| Typing indicator | `AparteConfig.setStatusRenderer(fn)` | `string \| HTMLElement` |
| Error bubble content | `AparteConfig.setErrorRenderer(fn)` | `string \| HTMLElement` |
| Attachment chip | `AparteConfig.setAttachmentRenderer(fn)` | `string \| HTMLElement` |
| Branch/sibling indicator | `AparteConfig.setSiblingNavRenderer(fn)` | `string \| HTMLElement` |
| Bubble skeleton | `AparteConfig.setBubbleShellRenderer(fn)` | `string \| HTMLElement` |
| Avatar | `AparteConfig.setAvatarProvider({ render })` | mounts into host + cleanup |
| A segment type | `registerSegmentRenderer({ type, render })` | `string \| HTMLElement` |
| A toolbar action | `AparteConfig.registerBubbleAction({...})` → `aparte:action` | — |
| Inline reasoning tags | `new AparteStreamParser({ thinkingDelimiters })` | — |
| Whole bubble (per framework) | wrapper `renderBubble` / `bubble` slot / `[bubbleTemplate]` | framework node |
| Empty state (per framework) | wrapper `emptyState` / `empty-state` slot | framework node |

> **Ordering matters for hooks that affect elements already in the page.** Some
> Aparte elements (e.g. `<aparte-chat-status>`) self-register on import and render
> immediately. Set your config hooks at app init. Persistent elements re-render on
> a live config change, but setting hooks up front is the clean pattern.

---

## Render hooks (config-level)

### Typing indicator — `setStatusRenderer`

Replaces the inner markup of `<aparte-chat-status>` (default: avatar slot + animated
dots). The element keeps owning show/hide and the accessible name.

```ts
import { AparteConfig } from '@aparte/core';

AparteConfig.setStatusRenderer((text) => {
  const el = document.createElement('div');
  el.className = 'my-typing';
  el.textContent = text;          // the `text` attribute, default "Typing"
  return el;
});
```

### Error content — `setErrorRenderer`

Drives the content of error bubbles (the built-in `error` segment). This is the
one place to customize error UI — return a friendly message with a retry button.
The bubble also carries `data-error` on its `.aparte-message` while errored, so you
can theme the whole errored turn with `.aparte-message[data-error] { … }`.

```ts
AparteConfig.setErrorRenderer(({ message }) => {
  const el = document.createElement('div');
  el.className = 'my-error';
  const strong = document.createElement('strong');
  strong.textContent = 'Something went wrong.';
  const p = document.createElement('p');
  p.textContent = message; // model/vendor-derived → textContent, NEVER innerHTML
  el.append(strong, p);
  return el;
});
```

### Attachment chips — `setAttachmentRenderer`

Replaces the chip rendered for each attachment on a user message (default: image
thumbnail or file chip). Called once per attachment. When you provide a renderer
you own the markup **and** the interactions (the built-in image-tile
`aparte:attachment-preview` click is not wired for custom output).

```ts
AparteConfig.setAttachmentRenderer((att) => {
  const el = document.createElement('div');
  el.className = att.type === 'application/pdf' ? 'pdf-chip' : 'file-chip';
  el.textContent = att.name; // user-supplied filename → textContent, not an HTML string
  return el;
});
```

> **Security:** a render hook that returns a **string** has its result assigned to
> `innerHTML`. Never interpolate model- or user-supplied values (`message`, `att.name`,
> a model-authored title) into that string — return an `HTMLElement` built with
> `textContent` (as above), or escape first. To harden the whole markdown/HTML path,
> swap in DOMPurify via `AparteConfig.setHtmlSanitizer(html => DOMPurify.sanitize(html))`.

### Branch indicator — `setSiblingNavRenderer`

Replaces the `‹ N / M ›` counter between the prev/next arrows — e.g. a row of dots.
The arrows keep their behavior (they dispatch `aparte:branch-navigate`). A string may
have multiple roots (set via innerHTML).

```ts
AparteConfig.setSiblingNavRenderer(({ count, index }) =>
  Array.from({ length: count }, (_, i) =>
    `<span class="dot${i === index ? ' active' : ''}"></span>`).join(''));
```

### Bubble skeleton (advanced) — `setBubbleShellRenderer`

Reshape the bubble's structural markup while keeping the native machinery
(segments, streaming, action bar, avatar, branch picker). Distinct from
`renderBubble` (wrapper-level, replaces the element entirely).

**Contract:** the shell's root must be `.aparte-message` (it carries `data-role` /
`data-streaming` / `data-error`), and it must include the region hooks you want
populated. Any you omit stay empty — every lookup is null-guarded, so a partial
shell degrades gracefully.

| Region hook | Filled with |
|---|---|
| `.aparte-avatar` | avatar provider / initial |
| `.aparte-name`, `.aparte-timestamp` | name / time |
| `.aparte-attachments` | attachment chips |
| `.aparte-segments` | streamed/structured segments |
| `.aparte-content` | simple markdown content |
| `.aparte-action-bar` | copy/retry/edit/… + custom actions |
| `.aparte-branch-picker` (+ `.aparte-branch-prev/-label/-next`) | sibling nav |

```ts
AparteConfig.setBubbleShellRenderer(({ role, name, avatarInitial }) => `
  <div class="aparte-message" data-role="${role}">
    <div class="aparte-avatar" data-role="${role}">${avatarInitial}</div>
    <div class="aparte-body">
      <div class="aparte-header"><span class="aparte-name">${name}</span></div>
      <div class="aparte-attachments" hidden></div>
      <div class="aparte-segments"></div>
      <div class="aparte-content"></div>
      <div class="aparte-footer">
        <div class="aparte-branch-picker" hidden>
          <button class="aparte-branch-prev">‹</button>
          <span class="aparte-branch-label"></span>
          <button class="aparte-branch-next">›</button>
        </div>
        <div class="aparte-action-bar"></div>
      </div>
    </div>
  </div>`);
```

> **Security:** `role` is a fixed enum, but `name`/`avatarInitial` can carry
> configured or model-influenced text — escape them before interpolating into this
> string (or set them with `textContent` on the built nodes), per the caution above.

### Avatar — `setAvatarProvider`

Unlike the hooks above (which return content), the avatar provider receives the
live `.aparte-avatar` host element and fills it — so you can mount a framework
component and return a cleanup function.

```ts
AparteConfig.setAvatarProvider({
  render: (role, host) => {
    host.textContent = role === 'assistant' ? '✦' : 'You';
    return () => { host.textContent = ''; };   // optional cleanup
  },
});
```

---

## Segment renderers

Segments are the units a message is built from (text, code, thinking, tool calls,
error, …). Register a renderer for a custom type, or override a built-in one. As of
this release, `render()` may return **a string OR an HTMLElement** — return an
element to mount live, interactive DOM directly.

```ts
import { registerSegmentRenderer } from '@aparte/core';

registerSegmentRenderer({
  type: 'poll',
  render: (segment) => {
    const el = document.createElement('div');
    el.setAttribute('data-segment-id', segment.id);  // so streaming updates find it
    el.append(/* … your interactive DOM with listeners … */);
    return el;
  },
});
```

> Keep a `data-segment-id="<segment.id>"` on your element's root so in-place
> streaming updates can target it (or implement the renderer's `update()`).

---

## Custom toolbar actions — `registerBubbleAction` + `aparte:action`

Add a button to the message toolbar beyond the built-in copy/retry/edit/feedback.
It's declarative (no `onClick`); clicking it emits a bubbling `aparte:action`
CustomEvent — the same DOM-event contract as the built-in actions.

```ts
AparteConfig.registerBubbleAction({
  id: 'share',
  icon: '<svg>…</svg>',        // raw SVG/HTML, or an icon-provider key
  label: 'Share',
  roles: ['assistant'],        // default: both
});

// Vanilla:
chatElement.addEventListener('aparte:action', (e) => {
  const { actionId, messageId, role } = e.detail;   // AparteActionEventDetail
  if (actionId === 'share') share(messageId);
});
```

The wrappers expose this as a typed event so you don't need `addEventListener`:

| Wrapper | API |
|---|---|
| React | `<AparteChat onAction={(d) => …} />` |
| Vue | `<AparteChat @action="onAction" />` |
| Svelte | `<AparteChat on:action={(e) => …} />` |
| Angular | `<aparte-chat (action)="onAction($event)">` |

---

## Whole-region replacement (per framework)

The core hooks above customize parts while keeping the native bubble. To replace an
entire region with your own framework component, the wrappers expose:

- **`renderBubble`** — render your own element per message instead of
  `<aparte-chat-bubble>`. React `renderBubble` prop · Vue/Svelte `#bubble` scoped slot
  · Angular `[bubbleTemplate]` (`TemplateRef`). Driven by the reactive message list,
  so it updates live during streaming (re-render from `message.content` /
  `message.segments` — no imperative interface to implement). A custom bubble owns
  whatever it wires (it can dispatch `aparte:retry` etc. or call the wrapper's
  imperative API).
- **Empty state** — content shown inside the viewport while the list is empty.
  React `emptyState` prop · Vue/Svelte `#empty-state` slot · Angular
  `[slot=empty-state]`.
- **Composer** — the `composer` slot replaces the default shell; `above-composer`
  and `footer-left/center/right` slots project into it.

---

## Inline reasoning tags — `thinkingDelimiters`

A model that streams its reasoning *inline in the content* (rather than on a
separate reasoning channel) wraps it in delimiter tags. The parser recognizes both
common conventions out of the box — `<think>…</think>` (DeepSeek-R1, QwQ, most local
GGUF reasoning models) and `<thinking>…</thinking>` (Claude-style) — so no config is
needed for those. To use your own delimiters:

```ts
import { AparteStreamParser } from '@aparte/core';

new AparteStreamParser({ thinkingDelimiters: { start: '<reason>', end: '</reason>' } });
// or several: thinkingDelimiters: [{ start: '<think>', end: '</think>' }, …]
```

---

## Good to know

- **Streamed text lands in `message.segments`, not `message.content`.** During
  streaming the parser splits the reply into typed segments (text / code / thinking
  / …); `message.content` stays empty for streamed replies. If you render a custom
  bubble, read `message.segments` (and fall back to `content` for seeded, non-streamed
  messages). Flatten with your own helper — segments each carry `content`.
- **Instance scoping.** `attachConfig(el, new AparteConfigClass())` scopes every hook
  above to components under `el`, so several independently-configured chats can
  coexist on one page. Components resolve their config via the nearest boundary,
  falling back to the global `AparteConfig`.
