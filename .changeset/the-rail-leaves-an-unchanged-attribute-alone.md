---
"@aparte/core": patch
---

`<aparte-scroll-rail>` no longer rewrites its `aria-label` and the current tick's `aria-current` on a reconcile when their values did not change. Nothing to change on your side.

A reconcile runs on every mutation of the transcript, and an attribute written to the value it already has is still a DOM mutation: a mutation observer on the rail sees it, and so does an assistive technology watching the tree. CI's WebKit measured it — a late host mutation after the last reply settled ran a reconcile that rewrote both attributes, unchanged, inside the window where the rail is meant to hold still. Both writes are now conditional, the way the ticks' labels already were.
