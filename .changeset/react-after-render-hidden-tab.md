---
'@aparte/react': patch
---

`<AparteChat>` now finishes its after-render work in a background tab too: a compaction that ends while the tab is hidden is saved at once, instead of when the reader comes back (and not at all if the tab is closed first).

The component waited for the next animation frame, and a hidden tab runs none while React still commits there. It now uses the next task when the document is hidden.
