---
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

The ergonomics helpers gain the four members they were missing — `getMessages`, `scrollToBottom`, `focusInput`, `getViewport` — so `useAparteChat` (React, Vue) and `createAparteChat` (Svelte) expose the whole imperative surface. On Angular: `AparteAiService` exposes `client` (the `AparteClient` the other three return as `{ client, abort }`), two new inputs `containerClass` / `containerStyle` land on the inner `.aparte-chat-container`, and `AparteUiProps` is exported. All four now re-export `AparteUiHandle` from `@aparte/core` rather than declaring their own copy.

The helper is the documented entry point, and it exposed 17 of the 20 members — silently narrowing the contract at exactly the reads and view acts a consumer reaches for after a send. `getMessages()` is not the `messages` state: the host's list is the authority and, mid-stream, a frame ahead of what the framework has rendered.

Angular's `containerClass` / `containerStyle` are the parity the other three get for free. Their root IS the container, so a consumer's `className` / `class` lands on the div carrying `.aparte-chat-container`, `[overlay-composer]` and `[data-aparte-empty]` — the selectors core's shell recipe keys on. Angular's own `<aparte-chat>` host sits one level above them, so overriding the shell needed a descendant selector there and nowhere else.

Also on Angular: the bubble-reconcile effect no longer skips an empty list (React, Vue and Svelte all sync unconditionally). With the default bubbles the `#bubble` query hid it by re-syncing on its own; under a custom `[bubbleTemplate]` that query never fires and the effect was the only path left.
