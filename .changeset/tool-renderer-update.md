---
"@aparte/core": minor
---

A tool renderer registered with `registerToolRenderer` can declare `update(element, segment)` and `relabel(element, segment)`; with `update`, a change of the call (its result landing, a decision, a failure) is patched into your element instead of rebuilding it from `render()`.

Without `update` core rebuilds — which it always did, and which is right for a receipt and wrong for anything with state: a mounted preview, an opened disclosure or a focused control was lost the moment the result landed. `relabel` is forwarded to your renderer on every config change (`setLocale`, `setIconProvider`, `reset()`) and core no longer applies its own pill selectors to markup it did not draw. Same two contracts as `AparteSegmentRenderer`, which is what makes a renderer that serves both a tool call and a segment a single implementation.
