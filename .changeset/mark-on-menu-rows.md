---
'@aparte/core': patch
---

`.aparte-mark` now tints a menu row (`.aparte-menu__item`), and a marked row in a checkable menu keeps its check gutter, so its label stays aligned with the others.

The row's transparent ground, at the same weight in a later sheet, erased the tint. And the mark's start-edge bar and the menu's check share `::before`: the gutter left the flow and the marked label moved 16px to the start edge. In a checkable menu the check is the row's signal, so the bar is not drawn there.
