---
"@aparte/core": patch
---

The scroll rail's first and last tick are full 24px targets: the rail pads its block axis so its own clipping no longer cuts them in half.

`--aparte-scroll-rail-hit-size` grows the pressable zone symmetrically around the drawn line — half of `hit − thickness` above it and half below. `aparte-scroll-rail` clips (`overflow: hidden`, which cuts at the padding box) and had no padding, and `.aparte-scroll-rail__list` has none either, so the first tick's top edge sat exactly on the clip line: its upper 11px were cut, and the last tick's lower 11px with it, for paint and for hit-testing alike. Two 13px targets, under WCAG 2.5.8's 24px — and they are the two a reader aims at most, "jump to the first message" and "jump to the latest".

The fix is the room, not a smaller zone: `padding-block: calc((hit − thickness) / 2)` puts the clip line outside every zone instead of through the two end ones. The inline axis already had this reasoning — it is why a zone grows inward only and why `--aparte-scroll-rail-width` carries the hit size as a floor — and it simply had not been carried to the block axis.

What moves if you had measured the rail: it is `box-sizing: border-box` now, so `max-height` still means the same outer box, and the ticks get 22px less room inside it — a very long transcript clips one tick sooner. The drawn line, the pitch and every token are unchanged.
