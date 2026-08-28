---
"@aparte/core": minor
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
"@aparte/angular": minor
---

`appendMessage(message, { historical: true })` now reaches the host from every wrapper — the React ref handle and `useAparteChat`, the Vue instance and `useAparteChat`, the Svelte component and `createAparteChat`, the Angular component — and `AparteChatImperativeApi` declares the option. A restored message is adopted as it is: no fresh timing stamps, `isStreaming` forced off, so a tool call read back from your own backend renders settled rather than spinning.

The host had accepted the option all along (it is how a stored conversation loads), but every wrapper's `appendMessage(m)` dropped the second argument on the way, so the replay-one-message-at-a-time path the core tests exercise was unreachable from a framework. Found by the second consumer, whose history lives on its own server.
