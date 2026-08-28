---
'@aparte/core': patch
---

Fixed: the delete button's cross was invisible while you hovered it, in both themes.

`--aparte-conv-delete-bg-hover: var(--aparte-error)` has been declared all along and never
applied: `.aparte-btn:hover:not(:disabled)` weighs 0,3,0 and `.aparte-conv-item__delete:hover`
only 0,2,0, so the recipe won the background. The recipe's hover rule sets no colour,
though, so the component's `color` DID apply — the ink meant for a solid red fill, painted
on a neutral surface. Measured in a browser: 1.17:1 on the light theme, 1.20:1 on the dark.

Feeding the recipe its own token instead of out-specifying it is the rule the neighbouring
sheets already follow. The red applies now, and the pair measures 3.70:1 and 4.84:1 —
clear of the 3:1 a graphical object needs. `.aparte-conv-item__archive` had the same
silent defect: its declared surface never applied either.
