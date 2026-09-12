---
"@aparte/core": minor
---

`AparteConversation` and `AparteConversationMeta` drop `folderId`, `lastMessagePreview`, `messageCount` and `totalTokens` — nothing in the library read them.

**Who has to change something.** Only a storage adapter that WRITES one of the four onto the object it hands back, and only if it types that object as `AparteConversation` / `AparteConversationMeta`. Records already in your store are untouched: the schema version is unchanged, nothing migrates, and an extra key on a stored row is still an extra key that reads back fine.

If your store computes any of them, keep them — on your own row type:

```ts
interface MyRow extends AparteConversationMeta {
  folderId?: string;
  messageCount?: number;
}
```

Why they leave. `folderId` was "optional folder/tag id for organisation", a column for a folders feature this library does not have; `lastMessagePreview` was a cached preview the sidebar never asked for (it renders the conversation it already holds); `messageCount` was "for the sidebar badge", and there is no badge; `totalTokens` was a per-conversation sum nothing added up. Four fields an adapter author had to decide about, on a contract that never read one of them. The token totals that DO exist stay where they are earned, in `AparteUsage` on a message.
