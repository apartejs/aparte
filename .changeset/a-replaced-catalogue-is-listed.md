---
'@aparte/plugin-model-selector': patch
---

`<aparte-model-selector>` lists the new models when a provider is replaced while it is on screen, instead of an empty list or the old models.

Nothing to change in your code. An app that replaces its model catalogue (`unregisterAIProvider(id)`, then `registerAIProvider(createModelCatalogue({ id, ... }))` with the new models) saw an empty picker: the second change was compared with the list loaded before the first one, taken for no change, and the load the first one had started, which saw no provider, wrote an empty list (apartejs/aparte#276). A change that comes while a load runs now makes that load go round again. And a provider registered again under the same id, a catalogue whose models changed, now reloads the list: the selector compared provider ids only, and kept the old models. A fresh id per catalogue, the workaround, is no longer needed.
