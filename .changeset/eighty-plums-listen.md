---
"@aparte/core": patch
---

Cancelling or saving an inline message edit returns the focus to the bubble's action bar instead of dropping it to the top of the page.

Both exits destroy the element that holds the focus: the editor node is removed, and the action bar is rebuilt with `innerHTML`, so the ✓ / ✗ buttons go with it. Focus fell to `<body>`, and the next Tab restarted at the top of the document — a reader who edited the fourth message of a long transcript had to walk all the way back down to it.

The bubble now remembers the `data-action` of the button the editor was opened from and focuses that action again on the way out. The string, not the node: the bar's markup is rewritten twice between the two moments, so the node identity cannot survive. When the focus was outside the bubble when the editor opened, nothing is remembered and nothing is pulled back — that would be theft, not a restore.
