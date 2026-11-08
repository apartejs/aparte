---
'@aparte/core': minor
'@aparte/provider-transformers': minor
'@aparte/provider-ai-sdk': patch
---

Retry no longer sends `temperature: 0.4`, which recent models refuse, unless the provider asks for it.

A provider that decodes greedily without a temperature, so a retry would repeat the same answer, now sets the new optional `retryTemperature`. `@aparte/provider-transformers` does. No other provider sends one on a retry, and models that sample by default still vary their answer.
