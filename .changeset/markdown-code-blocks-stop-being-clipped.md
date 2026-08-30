---
'@aparte/core': patch
---

A fenced code block written by the model now wraps instead of being silently cut off. Nothing to change on your side.

`@aparte/plugin-marked` renders ``` as a bare `<pre><code>`, and the stylesheet's only `pre` rule was scoped to `.aparte-code-content-wrapper` — a class only the `code` **segment** renderer emits, which marked cannot produce. So a markdown block matched no rule and kept the browser's `white-space: pre`: it never wrapped, laid itself out at its own intrinsic width, and the bubble's `overflow: hidden` amputated the tail. No scrollbar, no ellipsis — the code past the edge was simply gone.

Measured on one block: `scrollWidth` was a constant 963px at chat widths 1500, 800, 600, 512 and 380, against client widths of 776 / 724 / 524 / 460 / 328. It overflowed even at 1500. The same two declarations the code card already carries — `white-space: pre-wrap` and `overflow-wrap: anywhere` — now apply to prose as well, and the block ends on the column at every width.

Only the wrapping is shared, not the surface: the card's padding and background belong to the `code` segment, and giving a markdown block one is a look decision rather than this fix.
