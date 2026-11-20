---
'@aparte/core': patch
---

The open sidebar drawer now leaves Tab and Escape to a modal dialog opened above it, and to a word being composed in its search field.

A dialog opened from the drawer (the kit's `data-aparte-dialog-open` pattern) had Tab pulled back into the drawer it covers, so Tab did nothing, and Escape closed the drawer behind the dialog. The Escape that cancels an IME composition in the drawer's search field closed the whole drawer.
