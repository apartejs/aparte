---
"@aparte/core": minor
---

`<aparte-context variant="ring">` draws the gauge as a ring with the percentage beside it, for a toolbar where a bar wants a width and a ring wants none; the full reading (`100k / 128k`) is the ring's `title`. Same levels (`warn` / `danger` recolour the ring), same events, same accessible name — only the drawing differs. Two tokens size it: `--aparte-context-ring-size` (22px) and `--aparte-context-ring-stroke` (4, in the ring's own 36-unit box). The default stays the bar.
