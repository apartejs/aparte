---
"@aparte/core": patch
---

The `<aparte-split>` resize seam draws a real focus outline when it takes keyboard focus: `outline: var(--aparte-focus-outline-width) solid var(--aparte-border-focus)`, measured 3.54:1 against the page in the light palette and 7.36:1 in the dark one.

`.aparte-split__handle:focus-visible` was `outline: none` plus the soft `--aparte-focus-ring` shadow and nothing else. Measured, that ring is 1.39:1 against the page in the light palette and 1.83:1 in the dark one, where WCAG asks 3:1 of a focus indicator — so the seam's only keyboard affordance was, in practice, absent. It matters more here than almost anywhere else in the library: the seam is a 4px band with `border: 0` whose entire story is arrowing it, so a keyboard user who cannot see the focus has no other way to find it.

It now paints `outline: var(--aparte-focus-outline-width) solid var(--aparte-border-focus)` — 3.54:1 light, 7.36:1 dark — and keeps the shadow beside it as decoration, since a glow around the seam and an outline on it do not fight. The forced-colors entry in `responsive.css` is unchanged and now overrides an outline that exists rather than substituting for one that does not.
