---
"@aparte/engine": minor
---

Five loop fixes from the pre-beta audit. A Stop during a tool call, an approval wait, or with no resolver now ends the run with `run-aborted` (it emitted nothing, so the host never cleared its typing indicator or streaming id) — the event is decided once, at the loop's exit, from the signal, and lands after `text-flush`. A handler that throws settles its row with a new `tool-failed` event (`{ toolCallId, error }`) before the run ends on that error, instead of leaving the row "Running" forever. Per-tool `maxTurns` uses the same arithmetic as the global cap (`maxTurns: 1` is one call, not none). The `tool_call` envelope declares a call only once it is committed to a `tool_result` — a call halted before it (no handler, turn limit, abort) no longer appears in the history as a call that never gets a result. The built-in `create_artifact` fast path yields to a registered tool of that name.
