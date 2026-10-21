---
'@aparte/core': patch
---

Chrome 111, Safari 16.2, Firefox 121 and Samsung Internet 22 are supported again: the accent inks and the composer's padding now fall back where relative colour syntax or the `lh` unit is missing.

Each `--aparte-*-ink` is declared first as its accent mixed 40 / 60 with the text colour (on the default palette the worst case, a pressed soft wash on surface-3, measures 4.75:1 in light, and 6.58:1 on the page background), then, under `@supports (color: oklch(from red l c h))`, as the accent at the set lightness it was before. The editor padding reads the line height as `em` before `@supports (height: 1lh)` takes over, to the same pixel. Browsers with both features draw exactly what they drew.
