---
'@aparte/core': patch
---

`<aparte-chat-bubble>`'s example now shows a branch.

The element's `@example` had a plain bubble and a streaming one, and nothing with
siblings — so the `‹ 1 / 2 ›` picker, which is what retry-forks-a-sibling produces and
the whole subject of the branching guide, was never rendered anywhere on the docs site.
`setSiblings(count, index)` is a METHOD, not an attribute, so no amount of markup could
show it; the example needed the same small `<script>` the viewport, select and
conversation-list examples already use.

This is the source the docs read: the element page prints the example and its live
preview runs that same string, so one addition gives both a picture of a branch.
