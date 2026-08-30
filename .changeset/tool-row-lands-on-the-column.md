---
'@aparte/core': patch
---

A tool call's state ("Done", "Running") now ends on the same edge as the reply text. It stopped `--aparte-space-3` short of it — six pixels, on the one line of a turn whose whole job is to read as a quiet aside beside the prose. Nothing to change on your side.

The row's horizontal padding is its hover surface, not its column, so a negative margin gives it back and puts the row's content on the message column. That margin was `margin-inline-start` alone: the chevron, the icon and the name landed on the column, the trailing state did not, and the hover surface bled to the left only. `margin-inline` gives both sides back.

Measured at a 512px chat: the text spans L26/R26 and the state's right edge sat at R32; it is at R26 now, at every width. Reported by a consumer looking at a bubble that mixed a tool call and a text segment in a narrow pane — the case where the two segments sit one above the other and the eye reads the column as crooked.
