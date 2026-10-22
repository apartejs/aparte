---
'@aparte/core': patch
---

`center-empty` (and `centerWhenEmpty` in the framework packages) no longer slides the composer down for a conversation a script restores before anyone has touched the page: the restore lands in one frame. A send, an opened conversation and a new chat still glide.

The slide ran on any change out of the empty state, so a page restoring the last conversation right after load painted the welcome and slid it away under a reader who had done nothing, a layout shift (CLS 0.14 on a phone). The chat now sets `data-glide` at the first key or pointer in the page, or the first send, and the transition is keyed on it; the framework hosts set it on the wrapper's root.
