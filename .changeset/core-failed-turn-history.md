---
'@aparte/core': minor
'@aparte/plugin-compaction': patch
---

After a failed turn, every later request now sends the same history: the failed message goes with the next one from the next request on, or is left out of every request when its error says the same request fails again.

Do you have to touch your code? No. A server that compared histories and took a message ending in `"\n\n" + <a recorded message>` for that message can drop that workaround: the history no longer changes from one request to the next.

- **What changed.** The send cut the history at the last answered reply, so the request after a failed turn left the failed message out, and the request after that put it back, joined to the next message. A server that keeps its own record saw the past change under it. The send now cuts only the message being sent, and one rule, decided by the code on the failed reply's error segment, says what a failed turn leaves:
  - the network, a 5xx, a rate limit, a key, a Stop before the first token: the message is kept, and goes joined to the next one (`mergeAdjacentUserMessages`), as retry and edit already sent it;
  - `USAGE_CONTEXT_EXCEEDED`, `PROVIDER_POLICY`, `USAGE_BAD_REQUEST`: the message, and every message that went out with it, is left out of every later request, or the conversation could not go on;
  - a message that carried files is left out too: the history sends a message's text, never the files a send read, and the model would be asked about a file it is not shown.
- **Who follows it.** Send, retry, edit, the resume of a paused turn, the context gauge (`estimateWireTokens`, `measureContext`) and `@aparte/plugin-compaction`, whose cut no longer weighs a message no request sends and whose summary no longer reads it.
- **New export.** `withoutAbandonedTurns(messages)` returns the messages a later request still sends, for a `history` function or a server of your own.
- **What it fixes downstream.** An AG-UI thread numbers its messages by place, and the ids no longer name two different messages in one thread. n8n, which receives only the last message, now hears the failed one with the next instead of never.
