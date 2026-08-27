---
'@aparte/core': patch
---

Nine more class families show themselves, and tiles in a row line up.

The CSS classes reference had **10 live examples across 37 sheets**. Nine of the ten
Display families — avatar, tag, spinner, progress, skeleton, divider, alert, card, kbd —
reached the page as a list of class names and nothing else: a reader could learn that
`.aparte-skeleton--text` exists and never see what it looks like. Each now carries a
markup example in its sheet header, which is what the generator lifts into both the live
frame and the code block beside it. **10 → 19.**

The examples are written to exercise the thing the family is for: the avatar at three
sizes plus a group, the progress bar determinate *and* indeterminate, the skeleton as a
real loading block (circle, two lines, a rect), the alert with and without a title and
dismiss. Every glyph is core's own, verbatim from `src/icons/glyphs.ts`.

Twenty-seven sheets still have no example and that is correct: `theme.css` declares
tokens, `base.css` holds keyframes, `responsive.css` holds media queries, and the
segment / component / primitive sheets style elements that already have their own
generated preview pages. The classes page covers three groups — Controls, Display,
Surfaces — and those are now complete.

Also: `.aparte-thumbnail` gains `vertical-align: top`. Tiles of different sizes in one
row aligned on the baseline, so a large tile beside two small ones pushed the small ones
down and the row read as three unrelated things. An attachment strip mixes sizes by
nature, so it is the common case.
