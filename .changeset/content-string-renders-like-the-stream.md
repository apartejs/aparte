---
"@aparte/core": patch
---

An assistant message handed over as a markdown string (`appendMessage`, `setMessages`, `importTree`) now renders like the same words streamed: a fence becomes the code card with its filename, language and copy button, a `<think>` block becomes a reasoning block. You no longer call `parseMarkdownToSegments` yourself before appending.

The stream went through the parser and a string went through the prose renderer, so the same reply looked different once it came back from a store or a non-streaming call: a bare `<pre>` where the live turn had the card. `appendMessage` now runs the same parser, with the same registered stream blocks, on an assistant's `content` when it carries no `segments` and there is something to split. A user's message is not parsed, plain prose keeps the content path, and a message that already has segments is untouched.
