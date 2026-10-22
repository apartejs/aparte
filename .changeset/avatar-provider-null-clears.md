---
'@aparte/core': patch
---

`setAvatarProvider(null)` now takes the avatars off the messages already on screen, not only off the ones drawn after.

The bubble returned before touching the slot when no provider was registered, so what the old provider drew stayed. A custom shell's own avatar markup is kept: only what a provider drew goes.
