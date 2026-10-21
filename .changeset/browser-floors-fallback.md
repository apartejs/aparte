---
'@aparte/core': patch
---

Chrome 111, Safari 16.2, Firefox 121 and Samsung Internet 22 are supported again: the accent inks and the composer's padding now fall back where relative colour syntax or the `lh` unit is missing.

Each `--aparte-*-ink` is declared first as its accent mixed half-way with the text colour (the worst case on the default palette measures 5.25:1 in light), then, under `@supports (color: oklch(from red l c h))`, as the accent at the set lightness it was before. The editor padding reads the line height as `em` before `@supports (height: 1lh)` takes over, to the same pixel. Browsers with both features draw exactly what they drew.
