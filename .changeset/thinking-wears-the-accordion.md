---
'@aparte/core': patch
---

The reasoning block wears the accordion recipe instead of redrawing it.

A thinking segment is a disclosure — `<details>`, a `<summary>` you press, a panel, a
chevron that turns — which is exactly what `surface/accordion.css` draws. The renderer
drew a second one under four private classes, and it showed: the block looked unrelated
to every other disclosure in the library.

Worse, its chevron was the **character `▼`**. Not a glyph — a character, so it could not
take `--aparte-icon-size`, could not be replaced through the icon provider, and rendered
in whatever the platform font supplied. Core has had `expandIcon` in `src/icons/glyphs.ts`
the whole time, and the accordion uses it. It is now the same glyph.

`thinking.css` loses 33 lines of duplicated flex/reset/rotation and keeps four: the left
rail's padding and the quieter tone, which is the only part that is about *reasoning*
rather than about disclosure. The rendered element gains
`.aparte-accordion__item` / `__header` / `__panel` alongside its own classes, so a
consumer restyling either name still reaches it.

Found by Paul asking why the thinking block did not look like the accordion. A sweep for
the same defect elsewhere turned up one candidate — `menu.css`'s `content: '✓'` — and it
is **kept**: it reserves an alignment gutter on every checkable item and inherits `color`,
which forced-colors mode preserves. `▼` had neither reason and duplicated an existing
glyph; the two are not the same case.
