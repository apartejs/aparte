---
'@aparte/plugin-triggers': patch
---

A mention list asked of a function now loads while the app re-renders, instead of never arriving during a streaming reply.

A wrapper writes `triggers` on every render, with a new array, and a chat re-renders on every token. Each write aborted the request and armed the debounce again. The same search, asked of a function, is no longer asked again.
