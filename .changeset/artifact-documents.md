---
'@aparte/plugin-artifacts': minor
---

A document now has an id and versions: the model changes one by passing its id back, and `artifactDocuments(messages)` reads them from the conversation.

Nothing to change in your code. `create_artifact` gives each new document a short id (`doc_4f2a91c0`), returns it in its result and tells the model how to use it: call the tool again with `id` and the complete new content. A document written with the `<artifact>` tag gets one too, and now reads back to the model as the tag with that id (`<artifact id="…" type="…" title="…">`), so a model with no tools can rewrite it the same way. A call or a tag that names an existing id is a new version of that document; nothing is overwritten, the earlier versions stay in the conversation.

`artifactDocuments(messages, { tools?, read? })` is a pure function, exported for Node too. It returns `ArtifactDocument[]` with their `ArtifactVersion`s, oldest first. A call that was refused, stopped or failed is not a version. `read` translates a segment the plugin does not know (an agent's own document tool). A conversation saved before this release reads as one document per card.

`aparte-artifact-open` now also carries `documentId` and `segmentId`. A card in a reply dispatches `aparte-artifact-change` when it is drawn or changed.

The default system prompt gains one sentence, on changing a document; a prompt of your own is untouched.
