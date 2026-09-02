---
"@aparte/engine": patch
---

A Stop now ends the run immediately even when a tool handler ignores its abort signal — the turn no longer sits until `toolTimeoutMs` (five minutes by default), and a handler that resolves after the Stop no longer appends a tool result.

`invokeToolHandler` already raced the per-call TIMEOUT, for a measured reason: aborting a controller is a request a handler is free to ignore, and the default shape of a consumer tool — `async () => ({ content: await fetch(...).then(r => r.text()) })` — never reads its signal. The parent abort was left out of that race. It only ran `onParentAbort`, which aborts the same child controller the deaf handler ignores, so a Stop pressed while a tool was in flight changed nothing the user could see: the loop stayed parked on the handler, the typing indicator stayed up, and `run-aborted` arrived only once the timeout budget expired.

The parent signal is now a third racer beside the timeout, on the same terms: the signal still fires first, so a handler that honours it keeps the chance to reject cleanly, and the racer only decides the case where it does not. The listener is removed in the `finally` alongside the existing one, so a long turn does not accumulate listeners on the run's signal.
