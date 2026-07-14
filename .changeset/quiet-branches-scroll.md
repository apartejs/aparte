---
"@aparte/core": patch
---

Branch + shell fixes:

- **Message tree:** `MessageRepository._relink` no longer corrupts the old parent's
  active branch when the moved node was that parent's active child (it walked
  `findHead` into the subtree being moved and left a dangling pointer). Only reached
  on re-parenting the active child; retry/edit flows were unaffected.
- **`<aparte-chat>` shell scroll:** the shell now sets `height: 100%` so the inner
  scroll container has a definite height to resolve against. Inside a flex column with
  no definite ancestor height the container grew with content and nothing scrolled
  (messages/action-bars spilled below the view). Give the shell — or a parent — a
  definite height and it scrolls internally; the styled scrollbar, wheel, auto-scroll
  and scroll button stay wired to the same inner container. The scroll-to-bottom button
  is also re-derived from real geometry after a path re-render (a branch swap rebuilds
  the DOM with no `scroll` event, so it could otherwise stay stale).
