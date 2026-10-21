---
'@aparte/core': patch
---

The "send dropped: no model is selected" warning now names `<aparte-model-selector auto-select persist>`; `auto-select` alone writes nothing to the config, so following the old advice still dropped the send.

The `getModels()` JSDoc also says what the model selector does now: a provider without `fetchModels` shows its `getModels()` list there.
