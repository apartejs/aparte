---
'@aparte/core': patch
---

Fixed: the approval panel's options rendered as 44x44 squares with their labels
spilling out of them.

The composer's row sized its controls with `.aparte-composer-row button` — a type
selector, so it reached every `<button>` in the row, and a panel mounts inside that
row. An undo rule in `base.css` used to cancel it for panel content, but both had the
same specificity, so which one won came down to the order of two imports — and
splitting the stylesheet into families flipped that order.

The row now DECLARES `--aparte-btn-size` instead of restyling anything. A custom
property inherits, so each of the composer's own controls (all icon buttons) picks the
size up, and content that is not an icon button never sees it. Both the type selector
and its undo are gone. `.aparte-btn` gained `box-sizing: border-box`, which the type
selector used to supply.

If you set `--aparte-composer-control-size`, it still wins over `--aparte-send-btn-size`
inside the row exactly as documented — the send and action buttons read the row's value
first and their own second, rather than being out-specified.
