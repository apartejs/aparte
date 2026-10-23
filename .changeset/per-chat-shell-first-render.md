---
'@aparte/core': patch
---

A chat's own bubble frame (`setBubbleShellRenderer` on its config, or a framework's `config` prop) now reaches the messages drawn before that config was attached; they are drawn again in it, content kept.

A bubble drew its frame once, at connect, and under every wrapper the chat's config is attached after the first render — so the messages there at first render kept the page-wide frame while every later one wore the chat's. The bubble now redraws when the config above it changes and brings another frame — in a microtask, so a chat unmounting does not redraw its messages first, and after an open edit closes, not under it.
