---
'@aparte/core': patch
---

The two disclosure chevrons are the icon set's glyph instead of a hand-drawn CSS triangle.

The tool-call summary and `<aparte-optgroup>` each drew their arrow with a zero-size box
and four borders. That is not a style choice, it is a second icon mechanism: `expand`
already exists in `glyphs.ts`, and a consumer who registers an icon provider replaced
every other arrow in the library while these two stayed put. They now render
`getIcon('expand')` like the rest, so the provider reaches them, and the open state
rotates 180° rather than 90° because a chevron and a triangle do not turn the same way.
