---
'@aparte/core': patch
---

Fixed: a conversation row's label fell below WCAG AA the moment you hovered it.

The row rests at `--aparte-text-muted`, which is right on the shell's ground. Hover moves
the ground up to `--aparte-surface-3` and the muted ink stayed where it was: 4.23:1 in the
light theme, computed from the two hexes — an AA failure on body text, on the one row the
pointer is over. It takes the active colour on hover now, the same value the selected row
already uses, which measures 12.13 light and 11.71 dark.
