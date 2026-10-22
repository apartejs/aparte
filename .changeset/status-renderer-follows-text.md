---
'@aparte/core': patch
---

A custom status renderer (`setStatusRenderer`) is now called again when `<aparte-chat-status>`'s `text` changes, so the line shows the new text.

It ran only when the element first drew, and a `text` change wrote into the default text element, which a custom renderer does not have: the accessible name moved while the visible line kept the first text.
