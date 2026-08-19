---
"@aparte/core": patch
---

`injectTokenStream` / `streamTokens` now keep the framework's message list in sync. They
pushed every token to the viewport and told the framework **nothing**: the DOM held the
reply while React/Vue/Svelte state still had `content: ''`. Anything re-rendering from state
wiped the visible answer, `getMessages()` lied, persistence saved an empty message — and a
custom bubble (`renderBubble`, driven by that state) showed nothing at all.

Same discipline as `appendToSegment`: each token reaches the bubble immediately, the state is
synced **once per frame**, and a flush is guaranteed before completion, on abort, and before
any structural change. Both stream channels now fold into a single list update, so a frame
carrying tokens *and* segment chunks still costs one render. A stopped stream keeps what was
already streamed (truncated, not erased), and the sync targets the stream's own message id
rather than "the last message".
