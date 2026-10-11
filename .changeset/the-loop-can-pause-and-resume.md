---
"@aparte/engine": minor
---

New: `runStreamAgent` can pause on a tool call it cannot finish and resume it later. Pass `deferral` and a call that needs a person's decision, or a tool marked `external`, ends the run on `run-suspended` instead of waiting; a later run whose history ends on those calls, with their answers in `deferral.outcomes`, picks up where it stopped. **If you `switch` exhaustively over `StreamRunEvent`** (an adapter of your own), add a case for `run-suspended`; it only occurs when you pass `deferral`.

Nothing changes for a caller that does not pass `deferral`: the approval resolver still answers in place. The run that pauses reads the model's reply to its end, so every call of that reply is pending at once and a client can answer them in one round trip; nothing runs after the pause point, and a call the gate denies is refused, never deferred. A resumed run answers its pending calls through the same code a streamed call takes, and emits no `tool-start` for them, since their rows exist already. `unansweredTail(messages)` returns the calls a history leaves unanswered. This is the loop half of running the agent on a server; `@aparte/core` adds the server handler and the browser runner.
