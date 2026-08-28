---
'@aparte/core': patch
---

A resize now re-derives the scroll-to-bottom button, so it stops getting stuck visible
after a branch swap.

"Is anything below the fold" is a pure function of the geometry the viewport's
`ResizeObserver` exists to watch, and only the MUTATION path re-derived it — the resize
path recalculated the spacer and left the button showing whatever the last mutation
happened to measure. A branch swap rebuilds the transcript and React's height flickers
through it (1730 → 1934 → 1730, measured); the settle back down is a resize, not a
mutation, so a button evaluated at 1934 stayed wrong, and a swap fires no scroll event to
correct it.

Stated plainly: this closes a gap that is visible by reading, and it is covered by a test
that goes red without it. It is **not** proven to be the cause of the intermittent
`bubble-actions` failure on react-webkit — that one has not been reproduced locally (8/8
green), and the CI evidence (the button held visible across 43 polls, five seconds after a
swap) is consistent with this mechanism without establishing it.
