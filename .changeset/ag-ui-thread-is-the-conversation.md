---
'@aparte/runner-ag-ui': minor
---

An AG-UI turn now runs in the thread of its conversation: with no `threadId` given, the thread is the id of the conversation open in the chat, where it used to be a new one for every turn.

```ts
// Before, by hand: threadId: () => manager.activeId. Now it is the default.
createAgUiRunner({ endpoint: '/agui' });
```

Do you have to touch your code? Only if you gave no `threadId` and your agent keeps state or history per thread. Each conversation is then one session on the agent, not one per turn: Agno's session is now the conversation, and a history the agent stores for the thread arrives beside the whole history the runner still sends. A `threadId` you gave still decides, a chat with no conversation open still gets a new thread per turn, and a function that returns a new id each time gives the agent a new thread per turn, as before (it never sees a state or a cancelled interrupt again, since no thread comes back; the runner remembers the 64 most recently used threads, so such an app does not grow its memory):

```ts
createAgUiRunner({ endpoint: '/agui', threadId: () => `aparte-${crypto.randomUUID()}` });
```

- **What the agent sees.** The conversation's id as `threadId`, where it saw a random one, on every turn of that conversation.
- **State.** The state the agent last reported in a conversation is sent back as the next run's `state`, as it already was for an app that named its thread. Another conversation starts from `{}`.
- **Interrupts.** One the page could not answer is cancelled on the conversation's next run, as it already was for a named thread.
- **A pause** still resumes in the thread it paused in, whatever the conversation says.
