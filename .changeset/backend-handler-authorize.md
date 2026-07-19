---
"@aparte/core": minor
---

Harden the server-side `createAparteChatHandler`: add an optional `authorize(req)` gate
that runs before any work (return `false` for a 401, a `Response` for a custom rejection,
or `true` to proceed) so you can put auth in front of the key-spending `/api/chat` route,
and guard the vendor URL build against an adapter returning a non-rooted request path
(SSRF) by rejecting anything that isn't a single-rooted path.
