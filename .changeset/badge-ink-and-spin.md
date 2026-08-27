---
'@aparte/core': patch
---

Two the recipe sweeps missed.

**The badge's label was the fill.** `--aparte-badge-on-intent` answers what ink sits ON a
solid fill, and it is derived correctly — but base, `--soft` and `--outline` paint the
label with the raw `--aparte-badge-intent` on the PAGE background, which is a different
question. A fill is chosen to be seen as an area; the same value as 12px text is not the
same requirement, and on the light theme a soft warning badge came out at 1.75:1.
`button.css` was given `--aparte-btn-intent-ink` for exactly this and the badge was not.
Same name, same defaulting to the fill, so a custom `--aparte-badge-intent` still works;
the five accent inks `theme.css` already derives now carry the label. `--secondary` and
`--neutral` set no ink here either, as in `button.css`.

**The spinner ignored `prefers-reduced-motion`.** `--aparte-duration-spin` was the one
duration missing from the reduced-motion reset, so `.aparte-spinner`, the loading glyph
and the select's spinner kept turning. The block's own comment says it stops motion at
the source for the elements the descendant sweep cannot reach; it now includes the
duration all three of them read.
