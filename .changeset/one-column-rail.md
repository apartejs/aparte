---
"@aparte/core": patch
---

The composer's box now starts where the transcript's rows start, at every width: the viewport measures its own inset (padding plus the scrollbar gutter it reserves) and publishes it on the chat host as `--aparte-transcript-inset`; the composer pads by it, with the old `--aparte-viewport-padding` as the fallback when no viewport sits beside it.

Before, the two were independent stacks. The transcript's rows sat inside a padding plus the gutter the scroller reserves on both edges, the composer inside a flat padding — 10px apart at 768, the gutter's half apart at 1280 — and the container query that tightens the transcript under 520px could not reach the composer, which is a container of its own. The composer cannot know the gutter and a query cannot cross it, so the element that knows now says it. The property is written on the HOST, not on the viewport: the composer is a sibling, and a custom property only travels down.
