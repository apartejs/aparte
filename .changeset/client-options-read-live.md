---
'@aparte/react': minor
'@aparte/vue': patch
'@aparte/svelte': patch
'@aparte/angular': patch
---

`useAparteClient` in React now calls the function options of the latest render, so a resolver that reads state sees the state of now; calling a conversation helper's `init()` a second time no longer leaves the first manager writing its lists.

Nothing to change in your code; the ref you may have added to work around it keeps working.

- React: the client is still built once, on the first render, but `keyResolver`, `approvalResolver`, `streamRunner`, `requestInterceptor`, `history` (as a function), `targetResolver` and `fileInjectFilter` are called through the latest render's options. An `approvalResolver` over the conversation's mode, or a `keyResolver` over a settings form, no longer sees the values it had at mount. The other options (`config`, `scopeToTargetId`, `maxTurns`…), and whether a function option is there at all, are still read once: remount with a `key` to change them. Vue, Svelte and Angular closures already read live values (refs, stores, signals), and their pages now say so.
- `init()` of React's `useConversationManager`, Vue's `useConversationManager`, Svelte 4's `createConversationManager` and Angular's `ConversationManagerService`, called again, replaces the manager and stops following the one before; its subscription used to stay, and the first manager's notifications went on overwriting `conversations` and `activeId`. (Svelte 5's `createConversations()` already did this.) Its `options` are read when it runs: a `titleProvider` that reads state reads it through a ref, or is replaced with `manager.setTitleProvider()`.
