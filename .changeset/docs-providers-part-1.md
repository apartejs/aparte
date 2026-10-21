---
'@aparte/core': patch
'@aparte/plugin-model-selector': patch
'@aparte/provider-transformers': patch
---

Documentation only, no behaviour change: what `persist`, the backend transport, the model-preference example and the Transformers.js cache budget actually do.

- `<aparte-model-selector persist>`: it writes the pick into the config, which is what the next message is sent with. Without it the picker only fires `aparte-model-change`. It does not outlive a reload on its own; that takes `setModelPreferenceProvider()` and `restoreModelPreference()`.
- `setModelPreferenceProvider`: the example saved `{p, m}`, which restore cannot read. It now saves `{ provider, model }` and calls `restoreModelPreference()`.
- `AparteBackendTransport`: the page still registers a provider under each id the route knows. A stub that lists the models is enough for an id with no client package; the JSDoc shows one.
- `setMaxCachedModels`: the budget is how many models stay downloaded (disk), not how many are in memory.
- Runners: `tool_use` is in what a runner can emit, not in what it is given. `RunnerGenerateInput` carries no tool definitions.
