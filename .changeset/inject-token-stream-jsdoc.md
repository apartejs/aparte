---
"@aparte/core": patch
---

`injectTokenStream` / `stopTokenStream` now carry real JSDoc on the canonical
`AparteChatImperativeApi` (shipped in the `.d.ts`, so it surfaces in every
wrapper): the viewport auto-creates a missing assistant message internally
only, so wrappers should `appendMessage` explicitly before injecting. A new
"Bring your own loop" docs guide covers the display-only mode end to end.
