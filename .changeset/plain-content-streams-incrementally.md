---
'@aparte/core': patch
---

A streaming assistant message now renders incrementally on the plain-content path too, not
only inside segments.

`setStreamingMarkdownProvider`'s own documentation says the chat bubble uses it "to render
the assistant message token-by-token (incremental parse + DOM append, O(n)), instead of
re-parsing the whole string on every token", and `@aparte/plugin-streaming-markdown`'s page
repeats it. Only the segment renderers honoured it. `<aparte-chat-bubble>`'s simple-content
path — the one `getting-started` teaches first, through `appendMessage` / `appendToken` /
`completeMessage` — re-parsed, re-sanitised and re-inserted the WHOLE message on every
token.

It uses `writeStreamedMarkdown` now, the same seam the text and thinking renderers use, so
the promise holds on both paths. With no streaming provider registered nothing changes: the
seam falls through to the one-shot render, which is exactly what ran before.

The parser's cursor is dropped whenever content is REPLACED rather than appended
(`setContent`, or the `content` attribute changing) — a retry clears the bubble and
re-streams, and a stale cursor would slice the next delta out of the wrong string.

Found by a cold audit. Four tests pin it, and reverting the fix fails three of them.
