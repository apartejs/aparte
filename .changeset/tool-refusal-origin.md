---
"@aparte/engine": minor
---

`tool-rejected` now says who refused (`by`) and carries the person's `instruction`; `tool-aborted` says why (`cause`); `toolRefusal()` writes the refusal sentence.

`by` is `'person'`, `'policy'` or `'earlier-refusal'` (a call not run because another call of the same step was refused). `cause` is `'stopped'`, `'timeout'`, `'no-handler'` or `'no-resolver'`. An approval resolver may return `by`; without it a `reason` is read as a policy's, as before.

The sentence the model reads is unchanged — `reason` on the event and the `tool` message are the same string they were. `toolRefusal(decision)` returns it with `by` and `instruction`, so a runner that answers an agent the loop does not run writes the same one; with no reason of its own, its sentence follows `by` (a policy's refusal never says "rejected by the user"). A handler that rejects with an AbortError of its own — no Stop, no timeout — is aborted with no `cause`.
