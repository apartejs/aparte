---
'@aparte/core': minor
---

Every glyph the library draws now lives in one place, `src/icons/glyphs.ts`, and each is
an individual export.

Scattering them had not merely spread the source around — it had let them DRIFT. There
were three different ✕ (a filled one on a 12 grid, a stroked one at 2.5, and `close`),
two different chevrons, and `paperclip` and `scrollDown` each existed twice, byte for
byte, inside a component that could have asked for them. Three stroke widths, three
grids.

Four names are new, so a consumer's icon pack can now replace them: `info`, `archive`,
`unarchive`, `download`. The bubble's info glyph in particular was inline precisely so
that it needed no key, which meant nobody could change it.

A glyph no longer carries its own size — that is what kept the same drawing from being
shared. `--aparte-icon-size` is the one knob and it inherits, so a container declares it
and every glyph below follows; `.aparte-btn > svg` and the other rules that already
expressed size in CSS still win and are untouched. Measured in a browser: no icon
changes size.

Fixed: core's `loading` icon did not spin. It carried `aparte-icon-spin` and nothing
declared it.

`@aparte/core`'s JS bundle drops 2.1 kB.
