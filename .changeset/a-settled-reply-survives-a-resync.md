---
"@aparte/core": patch
---

With `@aparte/plugin-streaming-markdown` as your only Markdown renderer, a finished reply now stays rendered when your framework re-renders the chat, instead of turning back into raw Markdown a frame after the turn ends. Nothing to change on your side; the one-shot provider registered as a workaround can go (#89).

0.17.0 kept what the incremental parser drew on the settling update, but that update is not the last one a finished message receives. After every render the wrappers reconcile the last message, and for a finished one that sends each text segment `{ content, isStreaming: false }` again. The parser was gone by then, so the second settle fell through to core's escape-and-`<br>` default. The same happened to a reply streamed as plain `content` rather than segments, through `setContent`.

`writeStreamedMarkdown` now remembers, per content element, the content it settled on from the parser's DOM. A later non-streaming update carrying that same content leaves the element alone. Changed content, a one-shot provider registered since, or a new stream into the same element render as before.
