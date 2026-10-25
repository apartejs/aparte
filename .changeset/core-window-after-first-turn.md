---
'@aparte/core': patch
---

A model listed without a context window gets it after its first reply: the client reads the provider's model list again, once per model, so an LM Studio or Ollama model loaded on demand gets a gauge and compaction.

A local server that loads a model on its first request has no loaded window to report when the list is fetched at start-up, so the model came without one and the gauge and the compaction had nothing to measure against for the whole conversation. After a reply the model is loaded and the provider's probe finds the window. `refreshProviderModels()` now announces a change (`aparte-config-change`) when the current model's window changes, and only then; and an empty answer — what a provider returns when its fetch fails — keeps the list already held instead of wiping the selected model's capabilities.
