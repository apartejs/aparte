---
'@aparte/provider-transformers': minor
---

Replies are no longer cut at 512 tokens: without `maxTokens`, a reply runs until the model ends it or its context window is full. To cap it, set `maxTokens` in `registerModel` or on the request.

`TransformersModelConfig.maxTokens` is new; a request's own `maxTokens` still wins. The window is read from the model's config (`max_position_embeddings`, on the text half for a vision model); a model whose config names none stops at 4096 tokens. Stop interrupts a reply either way.

If you relied on the old ceiling, for instance to keep a small model from rambling, set `maxTokens: 512` on that model.
