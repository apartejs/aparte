---
"@aparte/core": patch
---

`reset()` and a double-click on the seam return an `<aparte-split>` to the position its markup declared, and a split folded before a move reopens at the size it had — both survive a re-parent (a framework re-render, a tab switch, dragging the panel elsewhere).

A re-parent — a framework re-render, a tab switch, dragging the panel elsewhere — runs `connectedCallback` again, and by then the `position` attribute holds the last commit rather than what the author wrote. The element captured it as the initial position, so `reset()` and a double-click on the seam went back to wherever the reader last dragged the seam.

Worse when it was folded: a collapsed split reflects `position="0"`, so the re-mount recorded 0 as the size to restore and `expand()` reopened onto nothing. The size it had before it folded is now kept across the move.
