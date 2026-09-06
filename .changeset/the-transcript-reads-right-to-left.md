---
"@aparte/core": patch
---

Transcript text aligns to the reading direction instead of the left edge, so an RTL page gets right-aligned messages. Nothing to change on your side unless you had overridden `aparte-chat-viewport { text-align }` to get this.

`aparte-chat-viewport` declared `text-align: left`, and `text-align` inherits: that one declaration reached every message, segment and paragraph below it. It could not lie while core wrote `dir="ltr"` onto its own DOM; now that the direction follows the host, an Arabic transcript came out mirrored with every line still hugging the left edge — lists indented on the right, the blockquote rail on the right, the prose left-aligned between them. It is `text-align: start` now. The suite that swept the sheets for physical edges reads `text-align: left|right` as physical too, across the whole corpus rather than the four sheets it had named.
