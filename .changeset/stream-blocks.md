---
"@aparte/core": minor
---

`registerStreamBlock({ tag, toSegment })` teaches the stream parser a tagged block: `<tag attr="…">…</tag>` in the model's prose becomes the segment you build, streamed delta by delta. `AparteStreamParserOptions.blocks` takes the same grammars when you drive the parser yourself.

Models write conventions into their prose — `<think>` for reasoning, `<artifact>` for a document, `<file path>` for a patch, `<cite>` for a source — and until now each one was a branch hard-wired into the parser, which is how the artifact ended up in core while being an app convention. The parser now does the streaming work once for every grammar: the earliest opening tag wins against a code fence and a reasoning delimiter, a tag cut at a chunk boundary is held back, attributes are parsed quoted or bare, a closing tag split across two chunks never leaks as content, a self-closing tag is a block with no body, and a block still open at the end of the stream is closed with what arrived. `toSegment` runs once, at the opening tag; the segment it returns carries a `content` string the parser fills. The blocks are read by the stream adapter when a turn starts. `AparteStreamBlock` and `AparteStreamBlockMatch` are exported; `unregisterStreamBlock(tag)` and `getStreamBlocks()` complete the set, and `reset()` clears it.
