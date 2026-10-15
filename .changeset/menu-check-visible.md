---
'@aparte/core': patch
---

A checked menu item (`role="menuitemradio"` or `menuitemcheckbox` with `aria-checked="true"`) now shows its check mark. Nothing to change in your code.

The menu keeps a gutter on every item of a panel that holds a checkable one, as a hidden glyph, so the labels share one edge. That rule uses `:has()`, which takes the weight of its argument, and it outweighed the rule that shows the glyph on the checked item: no menu showed which item was checked, the kit's own example included. The showing rule now carries the same `:has()`.
