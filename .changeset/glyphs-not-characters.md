---
"@aparte/core": patch
---

The branch picker's arrows are glyphs from the icon provider (so `setIconProvider({ prevBranch, nextBranch })` now reaches them), `menu` and `alertTriangle` join the built-in glyph set, `download` and `stop` are redrawn on the 24-unit grid the rest of the set uses, and a menu that holds a checkable item reserves the check gutter on every item.

The bubble wrote `‹` and `›` as text — hairline characters beside 2-unit SVG strokes in the same row — while the two glyphs already existed and were registered as provider keys nothing read. The app header's documented toggle drew `☰` as text because `menu` lived only in the extended set behind `@aparte/core/icons`, and the alert recipe's documented `<aparte-icon name="alertTriangle">` drew a 16px hole for the same reason; core's documented markup is core's drawing, so both move in (the extended set no longer exports them). Two of the 28 glyphs were on a 16-unit grid and painted their stroke 50 % heavier than their siblings. The menu's check gutter was reserved per checkable item, so a plain item beside a checkable one started 16px further left; a panel with any checkable item now reserves it on all of them.
