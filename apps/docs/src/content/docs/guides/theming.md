---
title: Theming an AI chat with CSS variables
description: aparté is 100% CSS-driven — restyle every part of the chat by overriding CSS variables, with no JS theme logic and no forking.
sidebar:
  order: 2
  label: Theming
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
  --aparte-bg: #fbf7f0;               /* YOUR page background — see the note below */
  --aparte-surface-1: #ffffff;        /* cards, code blocks */
  --aparte-surface-2: #f4ece0;        /* headers, inline code */
  --aparte-text: #241a12;
  --aparte-text-muted: #7c6f60;
  --aparte-border: #e7dccb;
}
```

:::note[Set the base, not the value it feeds]
"Derives" is literal: **218 of core’s variables read another one.** `--aparte-input-bg` is
`var(--aparte-surface-1)`, `--aparte-radius-bubble` is `var(--aparte-radius-lg)`,
`--aparte-avatar-bg-user` is `var(--aparte-primary)`. Those bases are read directly in 262
places across the stylesheets *and* feed the rest, which is why a rebrand is eight lines.

`--aparte-bg` is the one exception in that list: core paints no page background, so nothing
in the library reads it. It is declared for *your* CSS to reference.
:::

:::note[The ink on a fill is worked out for you]
Nothing above says what colour a label should be *on top of* `--aparte-primary`. That is
deliberate: change the fill and core recomputes the ink, so a solid button, badge or
checkbox stays readable whatever brand colour you set. It derives a light or dark ink from
the fill's own lightness — the same idea as Bootstrap's `color-contrast()`.

Say so yourself when you have an opinion. Every intent has a partner name, and declaring
one overrides the computed value for every control using that intent:

```css
:root {
  --aparte-primary: #1a1a2e;
  --aparte-on-primary: #f8fafc;   /* optional — omit it and core works it out */
}
```

The seven pairs are `--aparte-primary` / `--aparte-secondary` / `--aparte-neutral` /
`--aparte-info` / `--aparte-success` / `--aparte-warning` / `--aparte-error`, each with an
`--aparte-on-*` twin. Two numbers tune the computed default when you keep it:
`--aparte-ink-flip` (the fill lightness where the ink flips, `0.57`) and
`--aparte-ink-dark` (how dark the dark end goes, `0.176` — not `0`, so the ink keeps a
trace of the fill's own hue).

This used to be one fixed colour measured against *this* palette, which meant a dark brand
primary got near-black text on it and nothing said so. If you pinned `--aparte-on-primary`
or `--aparte-btn-ink` to work around that, you can drop it.
:::

The part worth knowing: it works **wherever you set the base**, not only on `:root` —
a themed subtree, a `[data-aparte-host]` boundary, or one element:

```html
<aparte-chat style="--aparte-primary: #16a34a"></aparte-chat>
```

That single attribute moves this chat's send button, its user avatar, its focus ring, its
input's focus border and its progress fill, and leaves every other chat on the page alone.
A derived variable is still yours to set on its own when you want one to break ranks — a
value you declare always wins over the one it would have derived.
:::

:::note[`--aparte-bg` is yours to paint]
Core sets no background on the chat root — it inherits from your page on purpose, so a
chat drops into any layout without punching an opaque rectangle through it. So
`--aparte-bg` is a **palette base**: aparté declares it and reads it nowhere. Keep it in
your theme block as the value your own page background and surfaces derive from, and give
the page that background yourself (`body { background: var(--aparte-bg); }`).

The generated [CSS variables](/reference/css-variables/) reference marks every token in
this position **palette only**, so you can tell a knob from a base at a glance.
:::

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

**Segments** — the rich blocks with a group of their own: `--aparte-code-*`,
`--aparte-thinking-*`, `--aparte-error-*`. The tool row has a single knob,
`--aparte-tool-row-radius`; everything else about it comes from the surface, border and
text tokens above.

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

### Mark the chosen row

"This one" is one recipe everywhere: the select's chosen option, a checked choice in the
elicitation panel, the conversation you are in and an answered question all wear the
**mark** — an intent tint on the ground and a bar on the row's start edge. Two tokens move
every mark at once, and the same class marks a row of your own:

```css
:root {
  --aparte-mark-tint: 12%;   /* quieter ground (18% by default) */
  --aparte-mark-bar: 3px;    /* a heavier bar (2px by default) */
}
```

```html
<li class="aparte-mark">Chosen</li>
<li class="aparte-mark aparte-mark--success">Accepted</li>
<li class="aparte-mark aparte-mark--quiet">Declined</li>
```

`--success`, `--danger` and `--neutral` change the intent; `--quiet` is the outcome that
did not happen — no tint, no bar, the muted text. Red is for what went wrong, not for
"no": a declined request is quiet, a rejected tool call keeps the muted voice with a cross
for a glyph, and a stopped one a stop square.

## Per-instance themes

Overriding on `:root` rethemes every chat. To run several differently-themed chats on one
page, set the variables (and `data-aparte-theme`) straight on each [`<aparte-chat>`](/components/conversation/aparte-chat/) — they
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
