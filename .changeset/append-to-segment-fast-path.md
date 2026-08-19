---
"@aparte/core": patch
---

`appendToSegment` no longer costs a full framework render per token. It used to
rebuild the message list and call `setMessages` + `onMessagesChange` on every
chunk — while the plain-text path (`appendToken` / `injectTokenStream`) wrote
straight into the bubble. Streaming a thinking block or a tool pill from a fast
local model was therefore unusable, and nothing in the imperative API hinted that
the two methods differed so much.

Chunks now go straight to the bubble as before-and-immediately, and the framework
state is synced **once per frame** (`requestAnimationFrame`, falling back to a
macrotask where it doesn't exist). Any structural change — a new segment, a new
message, a conversation swap — flushes the buffer first, so ordering is never
observable. Consumers that wrote their own rAF batcher around this can drop it.

The JSDoc and the "Bring your own loop" guide also state what was undocumented:
segments and `content` are mutually exclusive at render time.
