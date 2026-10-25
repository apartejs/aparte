---
"@aparte/svelte": minor
"@aparte/plugin-model-selector": minor
---

Svelte 5 apps now need Svelte 5.20 or later (peer `^4.0.0 || ^5.20.0`, on `@aparte/svelte` and on `@aparte/plugin-model-selector`'s optional Svelte peer); on Svelte 5, import from `@aparte/svelte/runes`; `createAparteChat` and `createConversationManager` are deprecated, and 0.26.0 moves today's package root to `@aparte/svelte/legacy`.

`@aparte/svelte/runes` is the chat written in Svelte 5: `<AparteChat>` with snippets (`emptyState`, `aboveComposer`, `composer`, `toolbar`, `bubble`), a bindable `messages`, callback props (`onmessageSent`, `onaction`, `onmessagesChange`, `onmessageAppended`, `ontypingChange`, `onconversationCreated`), a stable id from `$props.id()` and a server render that SvelteKit hydrates; `<AparteUi>`; `createConversations()` / `AparteConversations`, the saved conversations as reactive state; `createAparteClient`; and `<AparteToolUI>` / `<AparteSegmentUI>`. It needs Svelte 5.20 or later, and the peer range is now `^4.0.0 || ^5.20.0` for the whole package, the root entry included — and on `@aparte/plugin-model-selector`'s optional Svelte peer too, which follows the wrapper's: an older Svelte 5 that is installed now fails `npm install` with ERESOLVE, even for an app that only uses the root component or the plugin.

`createAparteChat` (use `bind:messages`) and `createConversationManager` (use `createConversations()`) are deprecated. In 0.26.0, `@aparte/svelte` becomes the runes component and today's — the Svelte 4 syntax component and these two helpers — moves to `@aparte/svelte/legacy`, where it keeps working on Svelte 4 and 5.
