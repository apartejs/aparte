---
"@aparte/engine": minor
---

`runStreamAgent` always emits a terminal event: a Stop now ends the run with `run-aborted` wherever it lands, and a tool handler that throws emits a new `tool-failed` event (`{ toolCallId, error }`) before the run ends on that error. Widen an exhaustive `switch` over `StreamRunEvent` for the new type.

Three of the six abort exits — a Stop during a tool call, during an approval wait, or with no resolver — emitted nothing at all, so a host never cleared its typing indicator or its streaming id. `run-aborted` is decided once now, at the loop's exit, from the signal, and lands after `text-flush`. `tool-failed` replaces a row that used to say "Running" for the rest of the session.

Per-tool `maxTurns` uses the same arithmetic as the global cap: `maxTurns: 1` is one call, not none. It was `>=` against a `>`, so one number meant two things on the two knobs and `maxTurns: 1` made a tool un-callable on the very first turn.

The `tool_call` envelope declares a call only once it is committed to a `tool_result`. A call halted before that point — no handler, turn limit reached, an abort — no longer appears in the serialized history as a call that never gets a result.
