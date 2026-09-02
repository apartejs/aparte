---
"@aparte/core": patch
---

A composer inside a chat host that has an `id` now stamps that id on `aparte-send`; on a page with two raw-core chats the reply no longer lands in the wrong one.

`submit()` read the bare `target` attribute. All four wrappers set it, so nothing changes there — but the documented quick start writes its markup by hand and nothing sets `target`, so every send from raw core carried `targetId: undefined` and the host delivered the answer to whichever chat it resolved first.

The composer's other outbound path, `cancel()`, already resolved through `_ownTargetId()` — the attribute if a wrapper set one, else the id of the `<aparte-chat>` / `[data-aparte-chat]` host above. `submit()` now resolves the same way, which is the invariant `cancel()`'s own docblock states: both sides answer the question "which chat am I" identically.
