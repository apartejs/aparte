---
'@aparte/provider-openai-compat': minor
---

`sendNames: true` sends a message's author as OpenAI's `name` field; it is on in `presets.OPENAI`.

Off by default, because other OpenAI-compatible servers refuse the field (Mistral answers 422). The name is fitted to what the API accepts — letters, digits, `_` and `-`, up to 64 characters — and left out when nothing is left of it.
