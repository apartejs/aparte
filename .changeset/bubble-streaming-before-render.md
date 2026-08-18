---
"@aparte/core": patch
---

Fix a pending assistant bubble showing its action bar (copy/retry) and no busy
state in every framework wrapper. A wrapper creates `<aparte-chat-bubble>` with
its attributes already set, so `streaming` arrived *before* the element rendered
its inner DOM — and `_updateStreaming()` had no `.aparte-message` to write to, so
`data-streaming`, `aria-busy="true"` and the class that hides the footer were
silently dropped for the whole turn. The state is now re-applied when the inner
DOM is built.

Visible effect: an empty, still-streaming reply no longer offers Copy/Retry, and
screen readers get `aria-busy` while the answer is being generated.
