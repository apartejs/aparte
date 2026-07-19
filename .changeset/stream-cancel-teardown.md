---
"@aparte/plugin-model-selector": patch
"@aparte/angular": patch
"@aparte/provider-openai-compat": patch
"@aparte/provider-ai-sdk": patch
---

Fix four teardown/cancellation bugs: the model selector could permanently lock itself out
of re-rendering if its render threw (now `try/finally`); the Angular Observable to
async-iterator adapter could hang forever if torn down mid-`await` (its `return()` now
settles the pending read); and the OpenAI-compat and AI-SDK providers now `cancel()` the
underlying stream on consumer cancel instead of draining the vendor body to the end (AI-SDK
also can no longer process a second terminal event).
