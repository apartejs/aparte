---
'@aparte/provider-transformers': minor
---

The model list (`fetchModels`, and so the model selector) now holds only the models you registered with `registerModel`; a model that is merely in the browser cache is no longer offered as a chat model.

The Cache API belongs to the origin, and the list merged everything it held: an app's own embedder, or another library's model, showed in the picker as a chat model with `['streaming']`. To list a model you downloaded earlier, register it. `listCachedModels()` still reports everything downloaded, for a settings panel.
