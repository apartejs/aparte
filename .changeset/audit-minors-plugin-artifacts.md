---
"@aparte/plugin-artifacts": patch
---

An app-built artifact segment with an upper-case `artifactType` (`'HTML'`, `'SVG'`) gets a working Preview tab.

The card lower-cases `artifactType` at every read, so a segment an app assembles by hand meets the lower-case names the parser produces. Compared case-sensitively it would not: `'HTML'` misses the previewable kinds after the tab has already rendered enabled, and the press shows nothing.
