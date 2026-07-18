---
"@aparte/core": patch
---

Collapse the triplicated send / retry / edit tail into one `_streamTurn` helper.

`_handleSend`, `_handleRetry` and `_handleEdit` each re-implemented the same
provider → tools → request-interceptor → `toolChoice:'none'` strip → reset-abort →
`aparte-message-start` → `_streamLoop` → `aparte-message-done` / lifecycle-error
sequence. They now share one private method, so that flow can't drift between the
three entry points. As part of it, `_handleSend` uses the shared `_resolveAuth`
helper and resets the abort flag before streaming — the two divergences the audit
flagged (a documented past drift). No behavior change on the happy path (verified:
867 unit incl. the retry/edit suites + parity, and 27/27 browser E2E).
