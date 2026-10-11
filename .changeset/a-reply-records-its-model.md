---
"@aparte/core": minor
---

New: an assistant reply records the provider, model and temperature it ran on (`AparteMessage.model`), and a turn a server paused resumes on them after a reload instead of on the model selected by then.

`AparteClient` writes `model: { providerId, modelId, temperature? }` on the reply when a turn starts. `resumeDeferred` uses it when that provider is still registered, and otherwise falls back to the default, as before. A per-message model (`modelId`/`providerId` on `aparte-send`) and a retry's temperature were lost across a reload before.
