---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

Giving a chat back the conversation it just created (`conversationId` set from `onConversationCreated`, or bound to the conversation manager's `activeId`) no longer reloads it in the middle of the first reply. New: `getConversationId()` on every `<AparteChat>` says which conversation that chat shows.

Do you have to touch your code? Only if a class of yours implements `AparteChatImperativeApi`: add `getConversationId()`. Otherwise nothing changes; the pattern the conversation persistence guide documents now works as written:

```tsx
const [conversationId, setConversationId] = useState<string | null>(null);
<AparteChat conversationId={conversationId} onConversationCreated={setConversationId} />
```

Before, the id came back while the first reply was streaming and the chat took it as a new conversation to open: it re-read the conversation from the manager, which did not hold the reply yet, so the reply's text landed in the person's bubble, the person's message disappeared and Send stayed disabled. Bound to the manager's `activeId` (natural in Vue, Svelte and Angular), the id came back even earlier, before the chat itself held it. A `conversationId` prop is now a no-op for the conversation the chat already shows or is creating. The imperative `setConversationId(id)` is unchanged: the same id again still re-reads the conversation.

`getConversationId()` is on `AparteChatImperativeApi`, so it is on React's ref handle, Vue's and Svelte's component instance, Angular's component, and `useAparteChat()` / `createAparteChat()`. It returns the conversation the chat opened, or the one its first message is creating, and `null` before either. Unlike the manager's single `activeId`, which names whichever chat opened a conversation last, it is per chat. `AparteChatHost` gains the two methods the wrappers call: `syncConversationId(id)` and `getConversationId()`.

In Angular, `setConversationId()` called on the component no longer leaves the `[conversationId]` input's next value compared against a stale id.
