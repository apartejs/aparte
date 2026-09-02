---
"@aparte/core": patch
---

The split's seam is a 1px line (`--aparte-split-seam-width`, the kit's border width) painted inside a 12px track (`--aparte-split-handle-size`, it was the 4px painted seam), with a grip under the pointer and while dragging.

One token sized both the grid track and the painted line, so the seam could not be thinned without moving the layout; at 4px it was four times the kit's rule and had nothing to take hold of — an interaction drawn as a decoration. The panes give up 8px between them; the grab zone is what it was on a fine pointer and the touch target on a coarse one.
