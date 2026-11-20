---
'@aparte/core': patch
---

A reply streamed by hand through a framework chat (`appendToSegment` in a loop) is written incrementally again, chunk by chunk, until `isStreaming: false` ends it.

Since 1.16's fix for edited replies, a segment with no `isStreaming` flag followed the bubble's `streaming` attribute, and every wrapper drops that attribute as soon as a reply driven by hand has a segment. Each chunk, and each frame's re-sync, then closed the stream and drew the whole text again: an unclosed `**` showed raw, and a highlighter, a diagram or a formula ran once per token. An append is now a stream whatever the attribute says, and a stream already open goes on until a flag ends it. A bubble with `streaming="false"` now reads as not streaming, as the bubble itself reads that value, so an edit of its finished reply is written whole.
