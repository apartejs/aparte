---
"@aparte/core": patch
---

The composer toolbar wraps, so a second control is no longer pushed off the composer on a phone.

**Nothing to change.** A row that already fits looks the same; one that does not now puts the overflowing control on a second line instead of past the edge.

`aparte-select` sets a `min-width` on its host — a hard floor, so a select in a flex row cannot shrink — and the arrangement we document puts two of them in this row: the approval switch (`@aparte/plugin-approval`'s own example says "beside the model selector, in the composer's toolbar") and the model selector. That is 400px of controls in a row the toolbar did not wrap.

Measured in Chromium at 390px, the width our responsive suite calls a phone: the model selector's right edge sat at 449 against a 390px viewport, and the page did not scroll to it — an ancestor clipped it. The model picker was unreachable, not merely ugly, and RTL mirrored it exactly at x=-59. The row is the fix rather than the example markup: a documented arrangement that needs an inline `style` to work is a missing knob.

An end-aligned control keeps its `margin-inline-start: auto` and lands at the end of the line it is on.
