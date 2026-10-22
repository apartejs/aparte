---
'@aparte/core': patch
---

A custom bubble shell's `.aparte-action-bar` now becomes a toolbar named from the locale (`messageActions`) when it declares no role of its own, as the default bubble's does.

The bar already got the roving tab stop, arrow keys between its buttons, but nothing told a screen reader it was a toolbar or what it was for: the shell contract lists class hooks, so a shell written from it carried no ARIA. A bar with its own `role` keeps it.
