---
'@aparte/provider-transformers': patch
---

`setMaxCachedModels` now counts and evicts only the models you registered; other Transformers.js weights in the browser cache are left alone.

The Cache API belongs to the origin, so an app's own pipelines (an embedder, a second library) store their weights next to the provider's. The budget counted them and, past its limit, deleted them — a model the provider never loaded.
