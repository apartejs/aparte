---
'@aparte/core': minor
---

`<aparte-conversation-list>` takes `group: { key, label }` on an item to list it under a heading of your own, and a `renderMeta(item)` property to draw a mark of yours after a row's title.

Nothing to change in your code. A row with a `group` is listed there instead of under its date or Pinned; the groups come first, in order of first appearance, and the rows without one keep the date groups below them. `renderMeta` returns an element, a string (text, never markup) or `null`; it sits beside the title button, not inside it, so a button of yours in it keeps its own name and tab stop. Setting it draws the rows again.
