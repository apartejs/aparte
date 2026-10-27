---
'@aparte/core': patch
---

A finished reply is no longer re-rendered or re-highlighted on every framework render, and `setHtmlSanitizer` now redraws what is already on screen.

A framework host re-sends `{ content, isStreaming: false }` to the last message on every render. Under a one-shot Markdown provider each of those rebuilt the whole element from the same string, throwing away what had been drawn on top of it, a highlighted fence for one, only to draw it again; and a code block was highlighted again from the same source. The settle now remembers what it wrote, under which config, and leaves an identical render in place; a code block re-sent unchanged keeps its highlight; and a block a highlighter has replaced is marked, so a later pass does not highlight it a second time as a block with no language. Changed content, another config, or a provider changed since, still redraws.

Changing the sanitizer used to apply only to what was rendered afterwards. It now counts as a rendering change, like setting a Markdown or highlight provider: messages already drawn go through the new one, and the config's listeners are told, synchronously. Passing the sanitizer already set changes nothing and tells no one.
