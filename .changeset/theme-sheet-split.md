---
'@aparte/core': patch
---

The tokens move to their own sheet: `styles/theme.css` holds the light palette, the
dark overrides and the derived layer; `styles/aparte.css` keeps the rules. You open one
to change a value and the other to change a look.

The cut is a **contiguous prefix** of the old file and the new sheet is imported
immediately before it, so the cascade cannot have moved — verified by concatenating the
two and comparing to the original **byte for byte**. The published `dist/index.css`
bundles both, so nothing changes for a consumer.

Two readers had to follow, and one of them was already broken by the move:

- `check:derived-vars` now reads every sheet **concatenated in import order**, the way a
  browser does. It had to: the anchored layer is in `theme.css` while its responsive
  overrides sit at the end of `aparte.css`, so a guard reading one file would judge half
  a rule. Its messages name the sheet and line they actually found.
- `gen-css-vars` pointed at `aparte.css` by path and went blind — it reported **6**
  declared tokens instead of 286 and would have published a page missing 24 variables.
  It reads both sheets now, and carries a floor that fails the build if the corpus ever
  collapses again rather than quietly publishing short. That is the failure mode this
  repo has already met once, on a guard that selected its corpus by file extension.
