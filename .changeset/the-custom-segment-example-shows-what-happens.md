---
"@aparte/core": patch
---

The custom-segment example now shows what actually happens: one renderer for `type: 'custom'` that switches on `subType`.

**Nothing to change** — this is the documentation catching up with the code.

The old `@example` on `AparteCustomSegment` sat under the sentence "with no renderer registered for `subType`, core draws `fallback`", which reads as if the registry looked `subType` up. It does not: `registerSegmentRenderer` keys on `type` and only on `type`. An author who registered a renderer for `'weather-widget'` saw nothing render, with no error to explain it.

So the example is now the whole shape — one renderer for `custom`, a `switch` on `subType`, and `fallback` as the default branch — and it says the other half out loud: an independent view takes its own `type` (register a `chart` renderer for a chart), and `custom` is for a family of small views an app would rather keep behind one key. The example is executed by a test, so the two cannot drift.
