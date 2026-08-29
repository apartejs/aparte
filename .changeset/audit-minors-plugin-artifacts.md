---
"@aparte/plugin-artifacts": patch
---

An app-built artifact segment with an upper-case `artifactType` (`'HTML'`, `'SVG'`) gets a working Preview tab.

The kind was compared case-sensitively against the lower-case names the parser produces, so a segment an app assembled by hand rendered an enabled Preview tab whose press showed nothing. Every read of `artifactType` in the card now lower-cases it first.
