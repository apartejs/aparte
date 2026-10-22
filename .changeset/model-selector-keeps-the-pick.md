---
'@aparte/plugin-model-selector': patch
---

Without `persist`, `<aparte-model-selector>` now keeps the model the person picked when the config changes for another reason (a language, a provider, an icon); it follows only a change to the config's own selection.

It compared the config's selection with the person's pick, and a pick made without `persist` writes nothing to the config, so the next unrelated change — a language switch — put the picker back on the config's default. It now compares the config's selection with the one it last read.
