---
'@aparte/core': patch
---

A custom bubble shell's `.aparte-action-bar` now becomes a toolbar named from the locale (`messageActions`) when it declares no role of its own, as the default bubble's does, and its unnamed branch arrows are named from the locale (`previousResponse`, `nextResponse`).

The bar already got the roving tab stop, arrow keys between its buttons, but nothing told a screen reader it was a toolbar or what it was for: the shell contract lists class hooks, so a shell written from it carried no ARIA. A bar with its own `role` keeps it.

An arrow counts as named, and is left alone, when it has an `aria-label`, `aria-labelledby` or `title`, or words in the button a reader can hear; a glyph like `‹` is not a name, nor an icon font's ligature or an SVG title under `aria-hidden`. A label stamped over a visible "Précédent" made a screen reader say "Previous response", and a voice command saying the visible word found nothing. To have your arrows and bar follow the locale, leave them unnamed.
