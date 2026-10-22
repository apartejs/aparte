---
'@aparte/core': patch
---

`setSegmentDefaults('thinking', { collapsed: false })` now opens the reasoning a provider streams on its own channel too, and keeps it open when the answer starts; without the default it still folds there.

The stream adapter created that block with `collapsed: true` and folded it again at the first answer token, and a field the producer sets beats a default — so the default only ever reached a `<think>` block written in the text.
