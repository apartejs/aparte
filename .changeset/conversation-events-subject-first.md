---
"@aparte/core": minor
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
"@aparte/angular": minor
---

The conversation list's seven events are renamed subject-first, with no alias: `aparte-conversation-select`, `-delete`, `-archive`, `-unarchive`, `-rename`, `-pin`, `-unpin` (were `aparte-select-conversation`, `aparte-delete-conversation`, …). Wrapper bindings follow: `onConversationSelect` in React, `@conversation-select` in Vue, `on:aparte-conversation-select` in Svelte, `(conversationSelect)` in Angular. The `no-groups` attribute is `flat` (`[flat]` in Angular).

Every other event of the library reads subject then verb — `aparte-select-change`, `aparte-message-start`, `aparte-split-resize` — and the conversation list's detail types were already subject-first (`AparteConversationSelectDetail`), so one `addEventListener` line carried both orders. `no-groups` was the only negative boolean attribute; `flat` says what the rows are, and covers the "pinned first" order the same flag also removes. Pre-1.0, a rename is a rename: this lands before the beta freezes the surface, and the old names are gone rather than kept as aliases.
