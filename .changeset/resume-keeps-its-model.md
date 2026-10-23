---
'@aparte/core': patch
---

Under the React, Vue, Svelte and Angular components, a reply is now saved with the model it ran on. A turn paused on a server and resumed after a reload goes back to that model, not to the default one.

The model is written on the reply while it streams, into the framework's list. The saved conversation tree is built from the viewport's own copy, and the step that brings that copy up to date carried the text, the segments, the status and the usage, but not the model. The vanilla `<aparte-chat>` was not affected.
