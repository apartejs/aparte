---
'@aparte/core': minor
'@aparte/engine': minor
---

**Refusing a tool no longer ends the turn.** The model gets a turn to answer in, so it reads the refusal.

Before: a refusal appended a *"Tool execution was rejected by the user."* tool_result and stopped the run — so the one sentence written for the model was never sent to it. Telling the assistant what you actually wanted meant retyping it as a new message, which it then read out of order.

After: the turn's **remaining** tool calls are still skipped (the model may have asked for several, and refusing one cannot license the others — that part was a real fix and it stands), and then another turn runs.

This needed one flag to become three states, because a refusal answers two questions differently: *run the calls that follow this one?* — no; *take another turn?* — yes. Core's `_handleToolUseEvent` returns `'continue' | 'respond' | 'halt'`; the engine's loop `break`s without clearing `continueLoop`. Both changed together, and the parity suite stayed green through it — which is the suite doing its job: it asserts the two loops agree, never what they do. The scenario named *"rejected stops the loop identically"* had to be renamed by hand for exactly that reason.

Two other outcomes are now visibly distinct from a refusal rather than sharing its exit: a per-tool turn limit, a missing handler, and an abort all `halt` and tell the model nothing.

**If you depended on the old behaviour** — a refusal ending the run — refuse from an `approvalResolver` and stop the client yourself, or set `maxTurns: 1` on the tool.
