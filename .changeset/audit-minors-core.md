---
"@aparte/core": patch
---

Two sends fired back to back keep their order, and an attachment named `A & B.png` reads as itself in the tooltip and the alt text.

A second send arriving while the first is still creating the conversation waits for it, so the two messages land in the order they were typed and the auto-title comes from the first. The attachment name was escaped twice on its way into the thumbnail's `title` and `alt` — escaped once as text, then handed to `escapeAttr` — so `A & B.png` was displayed as `A &amp; B.png`.

The rest, none of which changes a call you make. `modelSelectorPlaceholder` and `approvalModeLabel` are declared fields of `AparteLocale` (no value or behaviour changes — they were already read, just undeclared). `cssEscape` also escapes a newline. `updateMessage({ segments })` on a bubble copies the array in, as `setSegments` does, so a caller that mutates its own array afterwards does not reach into the bubble. The `headers` JSDoc says the session cookie only rides a same-origin endpoint; `setBubbleActions`'s example no longer claims `{ copy: false }` hides everything; `AparteClient` loses an abort-controller set nothing ever added to.
