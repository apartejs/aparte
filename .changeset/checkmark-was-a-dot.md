---
'@aparte/core': patch
---

The checkbox draws a checkmark, and a control sits on the line of text it labels.

**The checkmark was a dot.** `.aparte-checkbox:checked::after` sized itself
`inline-size: 30%; block-size: 55%` — and a percentage on a grid ITEM resolves against
its track, which `place-content: center` on the box collapses to the content's own size.
The content is an empty `::after`, so the track was zero and the mark computed to
**0.59 × 1.09px**: not a check, just the 2px corner where its two borders meet. Every
checked checkbox the library has ever rendered showed that dot. The indeterminate dash
had it worse — 55% of zero is zero, so it drew nothing at all. Both are now `calc()` of
`--aparte-checkbox-size` (measured back: 5.39 × 9.89px).

**And they rode above their labels.** Checkbox, radio and switch are `inline-grid` /
`inline-flex` boxes with no text inside, so their baseline is the bottom margin edge and
a control next to a word sat high. `vertical-align: middle` on all three — the commonest
way any of them is used, and it was never right.

Found by looking at a rendered preview at 4×, then reading `getComputedStyle(el,
'::after')`. The rule reads correctly in the file, which is why passes over this sheet
never caught it.

Also in the class examples, which are rendered live on the reference page: the thumbnail
row now runs large → base → small (it ran small → large), its image is a 2:3 portrait so
`object-fit: cover` is actually demonstrated, and the two choice controls sit one per
line instead of colliding — with no `.aparte-field-choice` wrapper, which drew a
full-width brass box around each row when checked.
