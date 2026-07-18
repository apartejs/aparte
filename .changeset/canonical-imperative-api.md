---
"@aparte/core": minor
"@aparte/angular": minor
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
---

One canonical imperative contract for `<AparteChat>` across the four wrappers.

`@aparte/core` now exports `AparteChatImperativeApi` — the ~20-method surface every
framework handle delegates to `AparteChatHost`. React's `AparteChatHandle` and
Vue/Svelte's `AparteChatInstance` are now type aliases of it, and the Angular
component `implements` it, so any per-wrapper drift (a missing or mistyped method)
is a **compile error** instead of a silent divergence.

**Angular parity:** adds the imperative `setConversationId(id)` method (the
`conversationId` `@Input` remains the declarative path), closing the one gap where
Angular's handle differed from the other three.
