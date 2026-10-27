---
'@aparte/provider-ai-sdk': minor
---

A reply from a model that reports its sources now lists them under the reply, and from `ai` 7.0.138 a citation puts a chip after the passage it supports.

Nothing to change in your code. The bridge reads `source` parts from `fullStream` (`url` → `{ id, url, title }`, `document` → `{ id, title }`, the filename when there is no title) and ends the turn with one `sources` event just before `done`; the same URL reported twice is one source. A model that reports none leaves the stream as it was.

From `ai` 7.0.138 a `text-end` part may carry `citations`, with offsets relative to that text part. The bridge rebases them onto the text of the whole call, so the chip lands after the right sentence; a citation with no offsets supports its whole text part, and its `citedText` becomes the source's snippet. The field is read without being typed, so the installed `ai` (`^7`) builds and runs the same with or without it.

A non-streamed request (`stream: false`) whose answer cites sources now returns the stream `[text, sources, done]` instead of a bare string, which cannot carry them; an answer that cites nothing still returns the string.
