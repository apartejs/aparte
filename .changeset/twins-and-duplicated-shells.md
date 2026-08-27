---
'@aparte/core': minor
---

Three pairs of tokens holding one value, and two rules written twice.

**The elicitation panel and the conversation item were outside the systems.** Their
sizes were literals off every step — `0.76`, `0.78`, `0.8`, `0.82rem` — and the same
`7px 10px` padding was written under two names. Eleven tokens now derive: sizes land on
the type scale, the padding on the spacing scale. Measured in a browser across both
themes: six values move, the largest by **0.48px**. The point is not the pixels — it is
that these two panels now follow `--aparte-font-scale` and `--aparte-space-unit`, which
they did not.

`--aparte-input-container-min-height` was `44px` beside `--aparte-touch-target-size:
44px`. The input's minimum height IS the touch target, so it reads it now.

**Two artifact segments shared one card shell, written twice** — nine identical
declarations on `.aparte-segment-artifact-card` and `.aparte-segment-artifact-file`.
One rule, two selectors. Checked before merging: nothing between the two positions
targets either, so the cascade is unchanged.

**`aparte-model-selector` and `.aparte-model-selector`** declared the same three
properties in two rules. The class is the hook for an app that lays out its own
selector, and it had drifted in one respect already: `[hidden]` covered the element
only, so a hidden wrapper carrying the class stayed laid out. Both are grouped, and
`[hidden]` now covers both.

### Looked at and deliberately left

`cursor: not-allowed; opacity: var(--aparte-disabled-opacity)` appears on six
selectors across two files. The value that could drift is already a token; what
repeats is `cursor: not-allowed`, which cannot. Grouping six selectors across two
files would move rules through the cascade for no protection.

Three token pairs that look like duplicates and are not, measured rather than assumed:
`--aparte-neutral` and `--aparte-text-muted` are equal in light and **diverge in dark**
(`#6d6479` vs `#a89bb6`), so merging them would break the dark theme;
`--aparte-text-inverse` equals the lightest surface in light and the darkest ground in
dark, which is one coherent idea — "the opposite pole" — not a copy; and
`--aparte-surface-3` equals `--aparte-border` in dark, which paints nothing wrong
because no element with a `surface-3` background carries a border.
