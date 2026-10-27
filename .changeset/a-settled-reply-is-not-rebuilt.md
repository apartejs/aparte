---
'@aparte/core': patch
---

A finished reply is no longer rebuilt on every framework render, and `setHtmlSanitizer` now redraws what is already on screen.

A framework host re-sends `{ content, isStreaming: false }` to the last message on every render. Under a one-shot Markdown provider each of those rebuilt the whole element from the same string, throwing away what had been drawn on top of it, a highlighted fence for one, only to draw it again. The settle now remembers what it wrote and leaves an identical render in place; changed content, or a provider changed since, still redraws.

Changing the sanitizer used to apply only to what was rendered afterwards. It now counts as a rendering change, like setting a Markdown or highlight provider, so messages already drawn go through the new one.
