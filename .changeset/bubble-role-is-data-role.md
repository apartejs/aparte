---
"@aparte/core": minor
---

`<aparte-chat-bubble>` reads its message role from `data-role` only; a `role="user"` / `role="assistant"` attribute is no longer honoured. If you write bubbles by hand, write `data-role` (the viewport and every wrapper already did).

`role` is ARIA's attribute — the element sets it to `article` on itself — and reading a message role from it too meant filtering our own value back out at every turn. Pre-1.0 a rename lands as a rename, without an alias.
