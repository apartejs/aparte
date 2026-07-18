---
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

README quick-start no longer re-adds the user message in the `messageSent`/`onSend` handler:
the chat appends it automatically on send, so the previous example rendered every sent message
twice (Angular: discarded the optimistic message via a `[messages]` round-trip). Now aligned
with the wrapper JSDoc and the tested playgrounds.
