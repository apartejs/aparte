---
"@aparte/core": minor
---

Two UI-kit classes: `.aparte-menu__body` + `.aparte-menu__description` for a two-line menu item, and `.aparte-field-warning` for a field's sub-text in the warning tone.

Both came from a shell moved onto the kit: a mode picker whose rows carry a name and a description had to lay a grid over `.aparte-menu__item` so the check gutter spanned both lines, and "this setting invalidates the saved states" had only `-hint` and `-error` to be painted as. The menu banner now also says that the check mark of a `menuitemradio` / `menuitemcheckbox` is drawn by the kit from `aria-checked` — the same consumer added a "✓" of his own and got two.
