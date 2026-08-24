---
'@aparte/core': patch
---

**An SVG artifact with only a `viewBox` now previews.** It showed a blank frame.

The preview document centres its content with `display:flex; align-items:center`, and an
SVG that carries only a `viewBox` — the recommended, responsive form, and the one a model
writes most often — has no intrinsic dimensions. As a flex item its cross size then
collapses to zero and the frame is empty. So the preview worked for the less idiomatic
SVG, the one that states its own `width`/`height`, and silently showed nothing for the
normal one.

Fixed with `svg:not([width]):not([height]){width:90%;height:90%}` — narrowed by attribute
selector so an SVG that asks for a size keeps it. A blanket `width:90%` was the shorter
fix and would have stretched every sized SVG instead.

The preview document had no tests. It has four now, including one that pins something
deliberate: it does **not** run the message sanitizer, because that drops `<svg>`
wholesale (correctly, for content rendered in the page) and would make every SVG artifact
unpreviewable. The CSP and the sandboxed frame are what make it safe.
