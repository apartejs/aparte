---
'@aparte/core': patch
'@aparte-workspace/docs': patch
---

Tabs gets its own entry, the class lists stop claiming classes they do not define, and a menu is menu-width.

**Tabs had no text and no preview.** `surface/tabs.css` carries the banner that opens the
whole Surfaces group (`aparté — layered surfaces`), and the generator consumes that as the
group's intro. A family takes its prose and its live example from a banner named after it
(`aparte-tabs — …`) — and there was none, so the Tabs family reached the reference page as a
bare list of class names while its own content was shown as the Surfaces overview. It now
carries both banners, and the family one demonstrates the two looks (`--underline`,
`--segmented`) with the panel under them. 19 → 20 live examples.

**The class lists were not the sheets' own.** The collector matched `.aparte-*` across the
whole source, comments included, so a class merely NAMED in prose was attributed to the
sheet that mentioned it: Tabs listed `.aparte-popover`, `.aparte-tooltip` and
`.aparte-btn--ghost`, none of which it defines. Block comments are now stripped first —
327 → **325**, and the two that went were phantoms.

**`.aparte-menu` had a floor and no ceiling**, while `.aparte-popover` — which the same file
calls "the identical floating list surface" — has carried `max-width: 320px` all along. With
only a `min-width`, a menu placed as a block child stretched to its container: a dropdown
spanning the full width of whatever held it. It now has the matching cap and
`width: max-content`, so it hugs its longest item and stops.

Also: preview frames get real padding (1rem → 2rem 2.25rem) — every example was pressed
into the top-left corner, which made a two-tile row read as debris rather than a specimen.
Left-aligned still, because an example has to lay out the way it will on the reader's page.
And the tooltip example's anchor gets room above it, so the tooltip is no longer clipped by
the top of its frame.
