---
title: Sizing and layout
description: How to size an aparté chat — a fixed box, a full page like ChatGPT with the scrollbar at the window's edge, or a pane beside a sidebar — and why the transcript, not the page, is what scrolls.
sidebar:
  order: 17
  label: Layout
---

An `<aparte-chat>` is a flex column — the transcript above, the composer below — and the
**transcript is the element that scrolls**. That one fact decides every layout on this
page: the chat needs a height to scroll inside, and the scrollbar sits wherever the chat's
right edge is.

## Give it a height

`<aparte-chat>` is `height: 100%` by default, so it fills whatever you size. With nothing
sized above it, it grows with its content and never scrolls — the most common first-minute
question. Three ways to size it:

```html
<!-- A box: the getting-started default. -->
<aparte-chat style="height: 600px"></aparte-chat>
```

```css
/* Inside a flex column with a header — the shape every example app uses. */
.app { display: flex; flex-direction: column; height: 100dvh; }
.app aparte-chat {
  flex: 1;
  min-height: 0;   /* lets the flex item shrink below its content, so it scrolls */
  height: auto;    /* the default 100% ignores the header and overflows the page */
}
```

```css
/* The whole page, no header. */
html, body { height: 100%; margin: 0; }
aparte-chat { height: 100dvh; }
```

`100dvh` rather than `100vh`: on a phone the dynamic unit follows the browser chrome as
it hides and shows, so the composer stays on screen.

## Fill the page — the scrollbar at the window's edge

ChatGPT and Claude look like the *page* scrolls: the scrollbar runs down the window's
right edge and the messages sit in a centred column. They are not scrolling the page —
their transcript is a full-width element, and the column is a `max-width` on the content
inside it. aparté already does the second half: bubbles and the composer centre themselves
at `--aparte-message-max-width` (800px). So the recipe is only the first half — **do not
box the chat**:

```css
/* Not this — the chat is a 820px box, so its scrollbar sits 200px in from the edge
   of a wide screen. */
.app { max-width: 820px; margin: 0 auto; }

/* This — the chat spans the page, the content centres itself, the scrollbar lands on
   the window's edge. */
.app { display: flex; flex-direction: column; height: 100dvh; }
:root { --aparte-message-max-width: 48rem; }   /* the column, if 800px is not yours */
```

Measured on the vanilla example at 1200px wide: the scroll surface's right edge moved
from 998px to 1200px and the bubbles stayed at 200–1000px. Nothing about scrolling
changed — the transcript still owns it, so following a streaming reply, the scroll-to-
bottom button and the "you scrolled up, we stop following" rule all keep working.

:::note[Why the page does not own the scroll]
It is tempting to make the transcript `overflow: visible` and let the document scroll.
It breaks silently: an element that does not scroll reports `scrollHeight ===
clientHeight`, so core reads "always at the bottom", the `scroll` event never fires on it,
and the follow rule, the scroll-to-bottom button and the reader-gesture detection all go
quiet — the page just gets longer. Every one of those behaviours was tuned against the
transcript being the scroller, on real regressions. Keep it that way and size the chat
instead.
:::

## A pane beside a sidebar

The chat is one flex item like any other. Give the row a height and the chat `min-width:
0` so a long code line cannot widen the pane:

```css
.workspace { display: flex; height: 100dvh; }
.workspace nav { width: 260px; flex: none; }
.workspace aparte-chat { flex: 1; min-width: 0; }
```

Below 520px of *chat* width the transcript switches to its narrow spacing on its own — a
container query on the chat, not a media query on the page — so the same CSS serves the
pane and the phone.

## Several chats on one page

Each `<aparte-chat>` scrolls on its own, so two side by side or one above another need
nothing more than a height each. Theming per instance is on the
[theming guide](/guides/theming/#per-instance-themes).

## The knobs

| Token | Default | Moves |
| --- | --- | --- |
| `--aparte-message-max-width` | `800px` | the centred column — bubbles and the composer |
| `--aparte-viewport-padding` | `--aparte-space-8` | the transcript's inset from the chat's edges |
| `--aparte-chat-bottom-gap` | `--aparte-space-8` | the space under the composer |
| `--aparte-scrollbar-width` | `6px` | the WebKit scrollbar (Firefox uses `scrollbar-width: thin`) |
| `--aparte-scrollbar-thumb` / `-track` | `--aparte-neutral` / `transparent` | its colours |

The complete list, with what reads each one, is the generated
[CSS variables](/reference/css-variables/) reference.
