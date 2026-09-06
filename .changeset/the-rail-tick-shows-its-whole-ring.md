---
"@aparte/core": patch
---

A focused scroll-rail tick draws its keyboard ring on all four sides, inset by the ring's own width. Nothing to change on your side; if you had re-declared `outline-offset` on `.aparte-scroll-rail__tick:focus-visible::before` to work around the clipping, drop it.

The ring is drawn on the `::before` that computes the tick's 24x24 pressable zone, and that zone is not merely near the rail's clip box — it is the clip box: the rail is exactly `--aparte-scroll-rail-width` wide with no inline padding, the zone is anchored to both of its inline edges, and the rail's block padding puts the clip line on the first and last zone's edge. `outline` paints outside the border box, so at the shared `0` offset both verticals fell into what `overflow-x: hidden` cuts, and the end ticks lost a third side. Measured on a page with the ring colour forced: 44 painted pixels on a middle tick, two detached 16px hairlines 24px apart with nothing marking the tick itself, and 26 on the last one. Offsetting inward by `--aparte-focus-outline-width` — the same idiom the conversation row and the image thumbnail already use, each for a clip of its own — paints 64, both verticals included.
