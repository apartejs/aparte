---
'@aparte/core': minor
'@aparte/plugin-model-selector': minor
---

A chat whose turns run on a server can list the server's models: `registerAIProvider(createModelCatalogue({ id, name, models }))` registers a provider that lists them and runs none, and `<aparte-model-selector>` shows them (#244). `aparte-model-change` now says `picked`, so an app that asks before switching can tell the person's pick from its own revert.

`createModelCatalogue` is the provider a server-loop page used to write by hand, a `chat()` that rejects: the selector lists its models, the one selected goes out on every request, and its capabilities gate what it cannot do. A page with no stream runner that sends anyway gets a `PROVIDER_MISCONFIGURED` error that says so. `picked` is `true` when the person chose in the list, `false` for `setSelection()` and for `auto-select`; without `persist`, a cancelled switch puts the old model back with `setSelection()` and that change no longer reads as a pick.
