---
"@aparte/provider-ai-sdk": minor
---

The `done` event now carries `finishReason`, mapped from the AI SDK's finish reason, so a reply the model stopped at its length limit shows as cut off.

`'stop'`, `'length'`, `'content-filter'`, `'tool-calls'`, `'error'` and `'other'` pass through; the SDK's `'unknown'` becomes `'other'`. A value the SDK adds later is left off rather than guessed.
