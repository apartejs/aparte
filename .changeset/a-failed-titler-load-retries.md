---
"@aparte/plugin-titler": patch
---

A failed model load is retried on the next title instead of disabling auto-titling for the life of the page. Nothing to change on your side.

The model is resolved once and cached, and the cache kept a REJECTED promise: one transient failure — the model fetch, a CSP hiccup on the dynamic import — and every conversation from then on quietly kept its default title. `@aparte/plugin-shiki` clears its cached promise on failure for the same reason. The error still reaches the caller; only the caching of it is gone.
