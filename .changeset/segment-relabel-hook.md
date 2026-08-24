---
'@aparte/core': minor
---

**New: `relabel` on `AparteSegmentRenderer` — a config change now reaches the text inside a rendered segment.**

A language switch or a new icon set left every segment already on screen in the old
language: a code block's copy tooltip, a terminal's Run label, a reasoning block's
"Reasoning", and — worst — the Approve and Reject buttons on a tool call waiting for a
human decision.

`relabel?(element, segment)` is called on a config change for every segment on screen,
bound by the same rule `update()` already carries: **attributes and text only, no
child node added or removed**. Implemented in the six built-ins that hold
config-derived text — `thinking`, `code`, `terminal`, `tool_call`, `error`,
`artifact/card`. `text`, `file-tree`, `progress` and `pipeline-waiting` do not
implement it, exactly as they do not implement `update()`: their chrome is their own
data.

**Why not simply re-render the segments.** That was the first plan, and an audit
rejected it. `_renderSegments()` wipes the container and rebuilds, which destroys
state the DOM owns and the segment data does not:

- a mounted sandboxed artifact preview, executing model-authored code, is torn down
  with no warning and the card falls back to its Code tab;
- a reasoning block the reader expanded by clicking `<summary>` snaps shut, because
  nothing writes that back to `segment.collapsed`;
- scroll position inside a long terminal or reasoning pane resets to the top;
- the focus on an Approve/Reject gate is dropped to `<body>` — for a keyboard or
  screen-reader user, mid-decision;
- a segment still streaming loses the incremental Markdown parser's buffered
  lookahead and restarts from the first byte;
- and the container-wide childList mutation is what the `update()` contract exists to
  avoid, because the viewport's observer reads it as "scroll to the bottom".

It would also have been an incomplete fix. Several strings were never routed through
`t()` at all — the error card's "Error" heading, the artifact card's `aria-label` and
its "Preview" / "Code" tabs, the download button, `progress`'s fallback label and
`pipeline-waiting`'s `aria-label`. A full re-render leaves every one of them in
English. Giving them locale keys is an additive change of its own; a test in this
change pins the "Error" heading so that change has something to break.

Nine tests, both halves seen to fail: disabling the loop reddens six of nine (the
three survivors assert absences), and making one `relabel` rebuild its node instead of
patching it reddens exactly the identity and label cases. One test opens a reasoning
block by hand and asserts a config change leaves it open.

One small behaviour change came with it: a code block's copy button marks itself while
its "copied" confirmation is showing, so a config change arriving inside that 1.5s does
not cancel what the reader is looking at.

Still to do, each for a reason: `aparte-elicitation` needs its pending state to keep a
reference to the panel, and the model-selector plugin needs to be additive to its own
`aparteConfigChanged` hook without re-running its population path.
