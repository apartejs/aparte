---
'@aparte/core': patch
---

Under the React, Vue, Svelte and Angular components, a message is now saved with every field written on it — `metadata`, attachments, the model a reply ran on — and comes back with them when the conversation is opened again. A turn paused on a server and resumed after a reload now goes back to the model it ran on, not to the default one.

The saved conversation tree is built from the viewport's own copy of the messages. The step that brought that copy up to date carried only the text, the segments, the status and the usage. Anything else (`host.updateMessage(id, { metadata })`, the model the client stamps on a reply) was saved in the flat list and missing from the tree, and a reopen loads the tree. The vanilla `<aparte-chat>` was not affected.
