---
'@aparte/core': patch
---

Fixed: `_meta.artifactHint` did nothing on a non-streaming reply.

The hint promotes a reply's first code fence to an artifact. The streaming path applies it
twice — as the fence closes, and again at finalize — and the path for a transport whose
`chat()` resolves a plain string applied it never. The same reply therefore rendered
`text | code | text` through core's inline loop and `text | artifact | text` through the
engine seam: one response, two products, decided by which transport happened to be wired.

That is the class of defect the engine parity suite exists to prevent, and it missed this
one because it never pairs a hint with a plain-string reply. Two tests now do.
