---
'@aparte/core': minor
---

Five segment types that were public in everything but name are now exported.

`AparteSegment` is exported and its union names all eight members, yet two of them could
not be written down: narrowing on `type: 'error'` gave a consumer the shape and no way to
declare a variable of it. `AparteErrorSegment` and `ApartePipelineWaitingSegment` are
exported now — the second was reachable from no barrel at all, not even the internal one.

`AparteSegmentBase` is the worse omission, because it is not an omission from a list: it
is the CONSTRAINT on the exported `AparteSegmentRenderer<T>`. Writing a renderer for a
segment type of your own means declaring `MyType extends AparteSegmentBase`, and the
package did not export the name.

`AparteSegmentTiming` types `meta.aparte`, which the customization guide already
described as "still typed" while it was unnameable; `AparteSegmentDefaults` types what
`setSegmentDefaults()` takes, and both are exported too.

All five are exported from the SSR barrel too — a type has no DOM, and TypeScript resolves
`types` under the `node` condition, so exporting them from the browser barrel alone would
have compiled for everyone except an SSR consumer.

No shape changed. This is the barrels catching up with what the types already said.
