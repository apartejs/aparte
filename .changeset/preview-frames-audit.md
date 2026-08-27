---
'@aparte/core': patch
'@aparte-workspace/docs': patch
---

Every live preview frame shows what it promises.

An audit photographed all 29 `/preview/*` routes and looked at them. Nine defects, in two
layers.

**The frame's own stylesheet (one word, every frame).**
`PreviewDocument.astro`'s `<style>` was not `is:global`, so Astro scoped it — and the
markup it styles is injected with `<Fragment set:html>`, which carries no scope class. So
`body > * + *` compiled to `body > :where(.astro-xxxx) + :where(.astro-xxxx)` and matched
nothing: the 1rem stacking margin had never applied, in any preview, since the file was
written. That is the badge, the progress track and the alert flush against each other, and
three unrelated surfaces touching in the overview.

**The examples (eight, one root cause).**
A literal `…` used as documentary shorthand for "your content here". It reads perfectly in
a code block and draws nothing in an iframe: `/preview/class/icon/` was a blank page, the
thumbnail preview an empty box beside a box holding three dots, `.aparte-btn--icon` an
invisible ghost square containing an ellipsis. Two more went with it — a `<details>` with no
`open`, so the accordion preview showed the single word "Shipping" and no affordance at
all; and a `<switch>` with no label pressed against its neighbour's text.

Every replacement glyph is core's own, verbatim from `src/icons/glyphs.ts` (and
`alertTriangleIcon` from `extended.ts` for the warning alert). Drawing them by hand would
have made a fourth `copy` and a third `check` — the drift that file exists to end.

The invariant that produced all of this stays, because it is right: the frame and the code
block read the same string, so a demo can never drift from the example above it. What
changes is that the examples are written for both readers.

Not covered, and worth knowing: only the `/preview/*` routes were photographed, in the
light theme, at one width, with nothing clicked.
