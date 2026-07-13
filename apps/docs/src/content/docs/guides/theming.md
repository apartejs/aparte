---
title: Theming
description: aparté is 100% CSS-driven — restyle every part of the chat by overriding CSS variables, with no JS theme logic and no forking.
---

aparté is **100% CSS-driven**. There is no JavaScript theme logic — you restyle the
whole chat by overriding **CSS custom properties**. Every visual value the components
render (colours, spacing, font sizes, weights, line-heights, radii, border widths) flows
through a variable, so a well-made theme never has to touch the component internals.

## How it works

The default theme lives on `:root` (and `:host`, for shadow contexts). Override any
variable wherever you like — globally, scoped to a subtree, or per chat instance:

```css
/* Global: retheme every aparté chat on the page. */
:root {
  --aparte-primary: #7c3aed;   /* your brand accent */
}

/* Scoped: only chats inside .support-widget. */
.support-widget {
  --aparte-primary: #0ea5e9;
}
```

Because they are plain CSS variables, they cascade and inherit like any other — no build
step, no theme provider, no re-render.

## Light and dark

Light is the default. Dark mode is opt-in: set `data-aparte-theme="dark"` on the chat
itself — or on any ancestor (`<body>`, `<html>`) — and the components read it.

```html
<!-- on the element itself… -->
<aparte-chat data-aparte-theme="dark"></aparte-chat>

<!-- …or on any ancestor, to theme everything inside -->
<body data-aparte-theme="dark">…</body>
```

:::note
Core does **not** auto-detect the OS preference — that's a product decision, so your app
owns it. Flip the attribute yourself, e.g. from a `prefers-color-scheme` media query or a
theme toggle:

```js
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.setAttribute('data-aparte-theme', dark ? 'dark' : 'light');
```
:::

## Rebrand in a handful of variables

Most of the palette derives from a few base tokens, so a rebrand is short:

```css
:root {
  --aparte-primary: #b45309;          /* accent — send button, links, focus, caret */
  --aparte-primary-hover: #92400e;
  --aparte-bg: #fbf7f0;               /* page background */
  --aparte-surface-1: #ffffff;        /* cards, code blocks */
  --aparte-surface-2: #f4ece0;        /* headers, inline code */
  --aparte-text: #241a12;
  --aparte-text-muted: #7c6f60;
  --aparte-border: #e7dccb;
}
```

## The scales

Structural values aren't magic numbers — they route through **scales**. Adjust a scale
and the whole UI re-spaces or re-sizes coherently.

| Scale | Tokens | Controls |
|-------|--------|----------|
| Spacing | `--aparte-space-1` … `--aparte-space-8` (2 → 16px) | gaps, padding, margins |
| Font size | `--aparte-font-size-2xs` … `--aparte-font-size-base` | component text sizes |
| Font weight | `--aparte-font-weight-normal` … `-bold` | text weights |
| Line height | `--aparte-line-height-none` … `-loose` | line heights |
| Radius | `--aparte-radius-xs` … `--aparte-radius-full` | corner rounding |

```css
/* A denser, squarer chat. */
:root {
  --aparte-space-6: 8px;      /* pull the default 12px paddings/gaps in */
  --aparte-radius-lg: 4px;    /* squarer bubbles, inputs, cards */
}
```

## Token groups

Variables are grouped by region. The most-reached-for ones:

**Core palette** — `--aparte-primary`, `--aparte-primary-hover`, `--aparte-bg`,
`--aparte-surface-1` / `-2` / `-3`, `--aparte-text`, `--aparte-text-muted`,
`--aparte-border`, and the status colours `--aparte-info` / `-success` / `-warning` /
`-error`.

**Message** — `--aparte-message-gap`, `--aparte-message-padding`,
`--aparte-message-max-width`, and the message surface:
`--aparte-message-content-bg-user` / `-assistant`,
`--aparte-message-content-text-user` / `-assistant`,
`--aparte-message-content-padding`, `--aparte-message-content-radius`.

**Avatar** — `--aparte-avatar-size`, `--aparte-avatar-radius`,
`--aparte-avatar-bg-user` / `-assistant`, `--aparte-avatar-image-user` / `-assistant`.

**Action bar** — `--aparte-action-bar-btn-size`, `--aparte-action-bar-btn-color`,
`--aparte-action-bar-btn-hover-bg` / `-hover-color`.

**Composer / input** — `--aparte-input-bg`, `--aparte-input-border`,
`--aparte-input-text`, `--aparte-input-placeholder`,
`--aparte-composer-control-size` (sizes the whole composer control row at once).

**Segments** — each rich block has its own group: `--aparte-code-*`,
`--aparte-thinking-*`, `--aparte-terminal-*`, `--aparte-error-*`,
`--aparte-file-tree-*`, `--aparte-progress-*`.

:::tip
The complete, always-current token list is generated from the stylesheet and surfaced in
the **API reference** — this page covers the ones you reach for day to day.
:::

## Recipes

### Give the assistant a bubble too

By convention the assistant is plain full-width prose (like ChatGPT / Claude) and only the
user message is a bubble. To make both sides bubbles:

```css
:root {
  --aparte-message-content-bg-assistant: var(--aparte-surface-2);
  --aparte-message-content-text-assistant: var(--aparte-text);
}
```

### Resize the composer in one line

Every composer control (input height + buttons) derives from a single token:

```css
:root { --aparte-composer-control-size: 52px; }  /* a chunkier composer */
```

### Swap the code font

```css
:root {
  --aparte-code-font-family: 'JetBrains Mono', ui-monospace, monospace;
}
```

## Per-instance themes

Overriding on `:root` rethemes every chat. To run several differently-themed chats on one
page, set the variables (and `data-aparte-theme`) straight on each `<aparte-chat>` — they
inherit down to its viewport, composer and bubbles:

```html
<aparte-chat class="brand-a"></aparte-chat>
<aparte-chat class="brand-b" data-aparte-theme="dark"></aparte-chat>

<style>
  .brand-a { --aparte-primary: #16a34a; }
  .brand-b { --aparte-primary: #db2777; }
</style>
```

## Beyond CSS

Some changes need markup or behaviour, not just colours — a custom typing indicator, your
own attachment chip, an avatar, extra action-bar buttons. Those are **render hooks** and
the **action registry**, covered in **[Customization](/guides/customization)**.
