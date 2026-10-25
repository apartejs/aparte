---
"@aparte/svelte": patch
---

`createAparteClient()` no longer fails a server render, and a server render no longer leaves its `keyResolver` on the global config.

It stopped the client in `onDestroy`, which Svelte runs at the end of a server render too, and stopping a client that never started read `window` there and failed every SvelteKit page that followed the docs. `stop()` now touches nothing of the browser for a client that never started (`@aparte/core`), so the stop stays in `onDestroy` — the one hook a server render runs — and takes back the key source the client put on the config when it was constructed. Moved to a hook a server never runs, each request would have added one to the config the whole process shares, holding whatever that request's resolver closed over.
