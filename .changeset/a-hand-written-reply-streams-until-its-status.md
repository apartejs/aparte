---
'@aparte/core': patch
---

Under React, Vue, Svelte or Angular, a reply you write by hand into an empty assistant message now streams until you give it a status, as it already did without a framework: end it with `updateMessage(id, { status: 'completed' })`.

The bring-your-own-loop flow (`appendMessage` with no status, `addSegment`, `appendToSegment`, then a status) lost its stream as soon as the first segment arrived when the empty bubble had been painted first, which any real wait before the first token causes: a wrapper draws a bubble's `streaming` from `isAwaitingReply`, which a segment turns false, and the bubble took that for the reply's end. Every chunk after it was drawn whole, an unclosed `**` showed raw, and a reasoning block read finished while it was still being written. The host now marks such a shell `streaming` when its first segment is written, and the status the app gives it ends it. A reply that already had words when a segment was added keeps the status the app gave it.
