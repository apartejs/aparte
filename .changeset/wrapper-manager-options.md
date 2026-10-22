---
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

The conversation-manager helpers of the four wrappers take the manager's options and expose the manager: `init(adapter, config, { retention, titleProvider })`, and `manager` once `init` has run.

`useConversationManager` (React, Vue), `createConversationManager` (Svelte) and `ConversationManagerService` (Angular) built the manager with no options and kept it private, so `retention` or a title provider meant building the manager yourself and registering it with `setConversationManager`, and what the helper does not mirror (`setTitleProvider`, `ensureFull`) was out of reach.
