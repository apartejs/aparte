---
'@aparte/plugin-model-selector': patch
'@aparte/core': patch
---

A model chosen through `/model` now sends `aparte-model-change` with `picked: true`, as a pick in the list does; nothing to change in your code.

The rows of `/model` in the triggers menu ran `setSelection()`, so the person's choice was told with `picked: false`, like a change made by code. An app that asks before switching (`if (!picked) return`) let it through without asking. Choosing through `/model` the model already selected now changes nothing and sends nothing, as in the list. `setSelection()` still sends `picked: false` (#255).
