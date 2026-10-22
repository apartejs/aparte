---
'@aparte/plugin-model-selector': minor
'@aparte/core': minor
'@aparte/locale-fr': minor
---

New `details` attribute on `<aparte-model-selector>`: each model shows its `description` and its `contextWindow` ("Long documents · 128K context") on a line under its name; the trigger keeps the name alone.

`<aparte-option>` takes that line as an `.aparte-option__meta` child, which the select's trigger and its width leave out and its filter searches. The context window's wording is the new locale key `modelContextWindow` ("{n} context", "{n} de contexte").
