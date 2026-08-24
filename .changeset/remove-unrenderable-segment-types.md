---
'@aparte/core': minor
---

**Removed: the `diff`, `image` and `preview` segment types.** Breaking, pre-1.0, no shim.

`AparteDiffSegment` (with `AparteDiffHunk` and `AparteDiffLine`),
`AparteImageSegment` and `ApartePreviewSegment` are gone, and the three members leave
the `AparteSegment` union. Core ships eight segment kinds.

All three were **declared and unrenderable**. They had complete data shapes, they were
members of the public union, and no renderer existed for any of them — so
`{ type: 'diff', hunks: [...] }` typechecked and then rendered
`[Unknown segment type: diff]` with a console warning. TypeScript accepted what the
screen refused; now both refuse.

Two of them were duplicating paths that already work better:

- an **image** is `![alt](url)` in the reply's markdown, which the markdown plugin
  renders — including the sanitising and the streaming-safe href checks;
- a **preview** is what the `artifact` segment does, inside a sandboxed iframe with a
  double-delivered CSP, mounted only on an explicit human press.

The third, **diff**, is a different case and got the same verdict for the reason the
`terminal` removal established: a patch is the *result of a tool* the model called, not
something the model emits. It belongs to that tool's renderer
(`config.registerToolRenderer`), where the request and the result already live —
or to a segment type of your own via `registerSegmentRenderer`, which is unchanged.

None of the five types was reachable from `@aparte/core`: they lived in the internal
types barrel and were never in the root export. So no import breaks. What changes is
that the union no longer promises three kinds nothing could display.
