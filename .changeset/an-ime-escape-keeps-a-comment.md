---
'@aparte/plugin-diff': patch
'@aparte/core': patch
---

An Escape that cancels a word being composed with an input method (Japanese, Chinese, Korean) no longer closes a diff comment or a message edit, and no longer drops what is being written.

The diff's comment field took every Escape as its own and let go of the form. The bubble's inline edit checked `isComposing`, which Safari does not set on the key it sends after a composition ends (keyCode 229). Both now leave a composition's keys to the composition, as the composer, the rename and the select already do.
