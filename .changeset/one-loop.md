---
"@aparte/core": minor
"@aparte/engine": minor
---

`AparteClient` runs `@aparte/engine`'s `runStreamAgent` by default; core's inline copy of the agent loop is deleted. `streamRunner` stays, to wrap or replace that loop (`(opts) => runStreamAgent({ ...opts, onHistoryAppend })` for a host that owns its transcript). `deriveArtifactKind` is the engine's, re-exported by core under the same name. Nothing changes in how you call either package — except that a tool call stopped while it waited for approval is now marked `aborted` on the engine path too, never `rejected`, and a host that stops the turn from the approval panel itself no longer leaves the call stuck at `awaiting-approval`.

Decision D1 of the 2026-08-28 audit, second half. Two copies of one loop were "kept in sync" by hand and by a parity suite; the same tool turn corrupted the history in two different shapes, one per copy, invisible to that suite precisely because they differed. The suite's 26 scenarios were snapshotted while both loops ran and were equal — the inline loop's behaviour, pinned — and now live in core, where they also hold the client's wiring to a direct engine run. That is what found the client writing `status: 'streaming'` once too often, and what dropped the change from 2 470 lines of client to 1 750.
