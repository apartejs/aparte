---
"@aparte/engine": minor
---

A tool handler may return `structuredContent` beside `content`; the loop forwards it on the `tool-resolved` event as `structuredResult`, so a renderer reads the value instead of re-parsing the sentence the model was given.
