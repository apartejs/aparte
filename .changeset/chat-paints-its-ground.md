---
"@aparte/core": minor
---

`<aparte-chat>` now paints its own background (`--aparte-bg`) and text colour (`--aparte-text`), so a light or dark chat stays readable on any page. To let your page show through as before, set `--aparte-bg` to your page's colour, or write `aparte-chat, [data-aparte-chat] { background: none; }`.

The palette sets a text colour and a ground together, and the chat used to paint only the text: its background was the host page's. A dark chat on a white page wrote light text on white, and so did a chat on a light-only site seen from a dark system, where the default follows `prefers-color-scheme` with no attribute at all; a light chat on a dark page went the other way. Three of those four combinations were unreadable. The rule applies to `<aparte-chat>` and to the `[data-aparte-chat]` root the React, Vue and Svelte wrappers render, at zero specificity, so a rule of yours wins whichever stylesheet loads last. `color` is set too: what you render inside the chat — a tool card, a slot — now inherits the palette's text colour instead of the page's.

A site that is light only can keep the chat light on a dark system with `data-aparte-theme="light"` on `<html>`.
