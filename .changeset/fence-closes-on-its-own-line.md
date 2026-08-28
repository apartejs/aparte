---
"@aparte/core": patch
---

A code block no longer closes on a streamed chunk that merely ends in three backticks — a fence has to start a line.

`const s = "```"` split by the tokenizer right after the quotes used to close the block mid-code, and the rest of the file streamed as prose. A reply that genuinely ends on ``` with no newline is still handled: the fence is stripped once, at the end of the stream, where it cannot mis-close anything.
