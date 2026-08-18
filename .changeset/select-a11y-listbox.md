---
"@aparte/core": patch
---

Accessibility fixes in `<aparte-select>` (and therefore the model selector), all
found by axe-core scanning an *open* dropdown:

- the `listbox` role moved from the dropdown shell to the options container, so
  the search field is no longer an invalid child of a listbox (critical);
- the `combobox` trigger now declares the `aria-controls` it is required to have,
  and the listbox carries its own accessible name (critical / serious);
- `<aparte-optgroup>` names itself with `aria-labelledby` instead of putting
  `aria-label` on its header div, which had turned a generic node into an invalid
  listbox child (critical);
- the selected option no longer paints white text on the brass accent (≈3.4:1 in
  light, worse in dark). It now uses an accent *tint* plus an inset accent bar and
  keeps the theme's text colour. `--aparte-select-option-selected` and
  `--aparte-select-option-selected-text` still override both.

Known remaining gap: collapsing a provider group is pointer-only (the group
header is not focusable).
