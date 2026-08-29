---
"@aparte/core": patch
---

Widening the window past the drawer breakpoint reopens the sidebar only when nothing had collapsed it as a column: `<aparte-sidebar collapsed>` in the markup, or a host collapse taken outside the drawer state, keeps it folded.

`_applyDrawer` reopened on every exit from the drawer state, against its own docblock ("unless the host had collapsed it before" — nothing recorded that). So a host that folded the column, or markup that shipped `<aparte-sidebar collapsed>`, got it back the first time the window crossed 48rem.

The element now records a collapse only when it is taken OUTSIDE the drawer state — dismissing an overlay says nothing about what a wide window should show — and its own breakpoint writes never count as the host's intent.

That intent is read from the markup once, on the first connect. A re-parent — a framework re-render, a tab swap, dragging the panel elsewhere — runs `connectedCallback` again, and by then `collapsed` can be the breakpoint's own doing: reading it a second time recorded the element's write as the host's word and the column stopped reopening for good.
