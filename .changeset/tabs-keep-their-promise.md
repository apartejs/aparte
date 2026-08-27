---
'@aparte/core': patch
---

Fixed: two `role="tablist"` that announced a pattern and shipped none of it.

The artifact card's Code/Preview tabs and the stepped elicitation panel's step chips both
carried `role="tablist"` with `role="tab"` children and no `aria-controls`, no
`role="tabpanel"`, no ids to point at and no arrow keys — two sets of ordinary buttons
wearing a role that tells a screen-reader user to expect a relationship and a keyboard
model that were not there. A role that lies is worse than no role: as plain buttons they
at least behaved as announced.

Both now do what they say. Each tab points at its panel and the panel names the tab back;
the tablist is ONE tab stop with ArrowLeft/ArrowRight/Home/End inside it, and the artifact
card skips the Preview tab while it is disabled mid-stream rather than trapping focus on
it. Ids are scoped — to the segment id on the card, to a per-panel counter in the
elicitation panel — because a transcript holds many cards and a workbench holds two chats.
