---
'@aparte/react': patch
'@aparte/vue': patch
'@aparte/svelte': patch
---

Calling the conversation helper's `init()` again while the first one is still loading no longer ends with the first manager registered on the config.

With a slow store (a remote one with a long history) and an account switch, the first `init()` resolved after the second and registered its manager last, so the chat persisted into the store of the account just left. A superseded `init()` now registers nothing. Angular's service already read its current manager and kept the newer one.
