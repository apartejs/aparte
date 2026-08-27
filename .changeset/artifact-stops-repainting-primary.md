---
'@aparte/core': patch
---

Fixed: the artifact card's primary button failed WCAG AA on its own label.

`.aparte-art-file__btn--primary` re-declared the fill, the border and the ink that
`aparte-btn--primary aparte-btn--solid` already paints. Five of those declarations were
inert duplicates; the sixth was not. `color: var(--aparte-text-inverse)` overrode
`--aparte-btn-on-intent`, which the recipe derives from the fill — measured in a browser
on the built stylesheet, 3.54:1 against the recipe's 5.27:1 in the light theme. It was
also the last rule in `styles/` forcing `--aparte-text-inverse` as ink on a coloured
fill, so a one-attribute rebrand re-derived the ink on every other solid-primary button
and, here alone, kept core's own palette.
