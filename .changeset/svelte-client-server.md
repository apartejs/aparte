---
"@aparte/svelte": patch
---

`createAparteClient()` no longer fails a server render: the client is stopped by the cleanup `onMount` returns, which never runs on a server, instead of `onDestroy`, which does.
