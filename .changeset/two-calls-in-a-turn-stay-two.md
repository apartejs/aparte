---
"@aparte/engine": patch
---

Two tool calls that arrive with the same id in one turn get one row and one history slot each; text streamed after a tool call reaches the history; and a Stop stays a Stop when the transport's iterator throws on the way out. Nothing to change on your side.

A call id is an identity downstream — the transcript keys a segment on `tool-${id}` and `updateSegment` takes the first match, and the history files a `tool_result` under `toolCallId`. A provider that repeats one (a vendor omitting `id` produced `''` for every call) therefore wrote the second call's result onto the first call's row, and left a pair no OpenAI-shaped endpoint can match on the next turn. A repeat is renamed rather than refused — the model asked for both — and the rename happens once, before the first emit, so the row, the handler, the approval and the history slot all name the same call.

The turn's `tool_call` envelope snapshotted the assistant's text when the first call was declared, and a turn can go on streaming afterwards. A provider that emits `[tool, text]` in that order (`@aparte/provider-scenario` does; `openai-compat` flushes its calls at the end of the stream and so cannot) showed the user a sentence the model never saw again. The envelope is re-read at the turn's end, the way its `toolCalls` array already was.

The abort path settled the transport's iterator without the `.catch(() => {})` the `finally` uses, so a host driving the loop with an iterator of its own turned a deliberate Stop into a thrown run error — and core paints an error card over the reply that was just stopped.
