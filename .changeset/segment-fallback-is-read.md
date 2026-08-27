---
'@aparte/core': patch
---

A custom segment's `fallback` is drawn when no renderer claims its type.

`AparteCustomSegment.fallback` has been published since the type existed, documented as
"Optional fallback text representation", and read by nothing — the only two mentions in
core were its declaration and its doc comment. A custom segment arriving somewhere its
renderer is not registered (a conversation replayed in another app, a client that loads
its views lazily, an exported transcript) rendered `[Unknown segment type: custom]` while
carrying the sentence written for exactly that moment.

It renders the fallback now, in a `.aparte-segment.aparte-segment-fallback`, as
`textContent` — the field is filled by whoever produced the segment, which can be a
model, so it is text and cannot carry markup. Without a fallback nothing changes: the
same `.aparte-segment-unknown` with the same `[Unknown segment type: …]`.

The developer warning is skipped when a fallback is present. An author who supplied one
has already said this can happen; warning then is crying wolf. Without one it still
fires, because a missing renderer is otherwise silent.

Found while writing the segment's own `@example` — the documentation asked what the
field does and the answer was nothing. The two identical unknown-segment blocks in the
bubble are now one function.
