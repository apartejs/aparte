---
"@aparte/core": patch
---

Stopping a client that never started no longer touches `window`, so it is safe on a server.

The constructor prepares the send handler without listening, and `stop()` only returned early when there was no handler — so it always removed listeners from `window`. On a server that is a ReferenceError; a SvelteKit page that started a client the documented way failed with a 500 (Svelte runs `onDestroy` at the end of a server render). A started client still removes its listeners on `stop()`, once.
