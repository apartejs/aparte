---
'@aparte/core': patch
---

A streamed reply no longer shows raw Markdown, such as the `**` of a bold, for a moment at the start of a text or reasoning block. Nothing to change in your code.

Who saw it: apps on `@aparte/plugin-marked/streaming`, or on marked beside `@aparte/plugin-streaming-markdown` (the pair Getting started sets up). With `@aparte/plugin-streaming-markdown` alone the first chunk was already formatted. It lasted until the next chunk arrived: a reply opening on `**Sure**` flickered its asterisks, and a block whose first chunk was `Done: **Book ` showed it as typed.

Why: a new segment's first chunk was drawn by the one-shot Markdown provider, which reads a half-written reply as finished text, and the streaming renderer (which closes what the model has not closed yet: remend for marked) only took over from the second chunk. The stream parser's text carries no `isStreaming` flag, and a segment's `setup` read that as finished, because a restored message's segments carry none either. Now a text or reasoning segment flagged `isStreaming: true` is written by the streaming renderer from its first chunk; `addSegment` on a streaming bubble treats an unflagged one as arriving; and `populateBubbleFromMessage` flags the last segment of a message whose status is `streaming`. A segment set by hand with `setSegments` is still drawn as finished, and every segment drawn this way is settled when the message stops, as one written chunk by chunk always was.
