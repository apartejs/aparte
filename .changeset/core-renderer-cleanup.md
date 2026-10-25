---
"@aparte/core": minor
---

Unmount what you mounted in a segment or a tool call in `cleanup(element, segment)`: core now calls it, once, when the element leaves for good.

`AparteSegmentRenderer.cleanup` was declared and never called; it is called now, with the segment's latest state, and `AparteToolRenderer` gains the same hook. It runs when the element is replaced by a new `render()`, when its segment is removed, when its message is redrawn in a new frame, and when its message leaves the page — but not for `update()`, not for `relabel()`, and not for a message a framework only moved (a bubble taken out and put back before the next microtask keeps its elements). A bubble that comes back after a longer absence draws its segments again. A renderer that replaces its own element inside `update()` cleans up what it replaced; the bubble follows the new element.

A tool call is updated, relabelled and cleaned up by the renderer that drew it, recorded when the row is set up — not by whichever renderer is registered at that moment, which could hand core's own row, or another renderer's markup, to an `update()` that never drew it.
