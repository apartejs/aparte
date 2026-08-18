---
"@aparte/core": minor
---

`AparteAIProvider.getModels()` is now typed **synchronous-only** (`AparteAIModel[]`).
The `Promise<AparteAIModel[]>` form was silently ignored by `getCurrentModel()`: an
async provider lost its capability list (e.g. `function_calling`), which disabled
tools with no error or warning. Async model fetching belongs in `fetchModels()`
(consumed by `AparteConfig.refreshProviderModels()` and the model-selector).
Plain-JS consumers that still return a Promise now get an explicit `console.warn`
instead of a silent failure. All bundled providers already complied.
