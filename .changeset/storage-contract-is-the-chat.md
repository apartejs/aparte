---
"@aparte/core": minor
---

`AparteStorageAdapter` loses its optional memory-fact, settings and artifact-gallery methods, and the `AparteMemoryFact` / `AparteArtifactRow` types are gone. `loadAttachments` and `AparteAttachmentRow` stay. An adapter that implemented the removed methods still compiles — they were optional — but the types it named have to come from your own code now.

The shape of a "memory fact" (`identity | fact | preference | tech | project | style`, a `source` of `auto` or `onboarding`) and of a settings entry is one product's schema, not a chat library's; a public contract that carries it binds every other adapter to that product's choices. Core never read any of those methods. The contract is now exactly what the chat needs persisted — conversations, their tree, their attachments — and an app extends the interface in its own code for the rest.
