---
'@aparte/core': patch
---

A card drawn from a block no longer shows a vertical scrollbar beside it.

The code card's `<pre>` had `overflow-x: hidden`, which turns its `overflow-y` into `auto`; a carousel reaching a few pixels past its box for its tiles' shadows made it scroll. A `<pre>` holding a drawing now never scrolls: the drawing handles its own overflow.
