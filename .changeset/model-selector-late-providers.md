---
'@aparte/plugin-model-selector': patch
---

`<aparte-model-selector>` now lists every provider you register, whenever you register it: before or after it mounts, with or without a model already selected, with `fetchModels` or a fixed `getModels()` list.

Three cases used to leave it empty or stale until a reload:

- A static import beside the code that registers the providers. Importing the plugin connects a tag already in the page, and the registration ran while its first load was in flight, before it listened for changes. It now listens first, and a change during a load runs the load again.
- A provider registered after mount when a model was already selected (a key typed in the app's settings). It now reloads when the set of providers changes, not only the selection.
- A provider with no `fetchModels`. Its `getModels()` list is now shown.

The `void import('@aparte/plugin-model-selector')` placed after the registration, which some setups used to dodge the first case, is no longer needed.

A fourth case, the normal order under every wrapper: the element connects on the global config, then the chat's own config is attached. A slow global `/models` that answered after the chat's load used to write the global models over the chat's. A load that a mount or a new config superseded now discards what it brings back.
