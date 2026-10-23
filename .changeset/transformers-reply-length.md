---
'@aparte/provider-transformers': minor
---

Replies are no longer cut at 512 tokens: the default ceiling is 8192, and `TransformersModelConfig.maxTokens` sets one per model. A request's own `maxTokens` still wins.

With the built-in runners, whatever the ceiling, a reply also ends where the model's context window ends, prompt included — read from the model's config (`max_position_embeddings`, on the text half for a vision model) — so a ceiling larger than the window has room for no longer runs the model past its context, and Stop interrupts a reply either way. A runner of your own receives the ceiling as `options.maxTokens` and is its own judge of the window; the README's example now wires Stop.

Why a ceiling at all, when the window already bounds a reply: decoding is greedy by default, and a small model stuck repeating itself would run to the end of a 32,768- or 131,072-token window. In the browser the attention cache grows with every token, so that ends in a GPU out-of-memory error rather than a stop. 8192 tokens is some 6,000 words.

If you relied on the old ceiling, for instance to keep a small model brief, set `maxTokens: 512` on that model.
