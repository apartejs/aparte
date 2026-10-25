---
'@aparte/core': minor
---

Use `measureContext({ messages, config, windowOverride })` to read how full the model's window is: the same measure the context gauge draws and the compaction plugin decides on. Nothing for you to change.

What is new, all additive:

- `measureContext` returns `{ window?, used, estimated, parts: { system, tools, summary, messages }, other }`. `used` is the last reply's reported usage while nothing the model reads has changed since it. After a message, a compaction or a Restore it is an estimate (`estimated: true`) of the request that would be sent now: the system prompts, the tool definitions, the checkpoint's summary and the messages after it, scaled by how far the heuristic was off on the last reply (its input tokens over `contextEstimate`, kept between 0.5 and 3; 1 when the reply recorded none). `parts` are the raw, unscaled estimates; `other` is what they cannot attribute (a server loop's own prompt and tools, template tokens, the heuristic's error), never below zero.
- `estimateTokens(text)` and `estimateWireTokens(messages)`. The second counts what the wire sends for those messages with the serialisation the client builds its history with: thinking is not counted, text and tool calls with their results are, a failed turn or one still in flight sends nothing.
- `AparteContextMeasure` and `AparteContextMeasureInput` (types).

Why. The plugin kept its own copy of the character heuristic and the gauge kept the number the last turn happened to report, so after a compaction the gauge was blank or stale and the plugin decided on figures the page never showed. They now read one function over one serialisation. The serialisation itself moved out of `AparteClient` into pure functions (`wireMessages` and friends in `client/wire-history.ts`); the requests it builds are the same as before.
