---
"@aparte/core": minor
---

The only model of the only registered provider is selected on its own, and a send dropped for want of a model says so in the console, once. `registerAIProvider()` selects the model when exactly one provider is registered, it lists exactly one model synchronously, and nothing is selected yet — a scripted or in-browser provider — and never overrides a choice already made or one among several. Nothing changes for a provider whose list comes from a fetch.

Issue #29: a page built from the docs alone, with `@aparte/provider-scenario` and no `<aparte-model-selector>`, sent nothing — the user's message sat there, no error, no console line — because no model was selected and there was nothing to select. The getting-started CDN snippet names its model now.
