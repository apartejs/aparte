---
"@aparte/core": patch
---

Extract `_streamLoop`'s ~190-line `tool_use` case into a `_handleToolUseEvent` helper
(built-in `create_artifact`, per-tool renderer, the human-in-the-loop approval gate, and
the handler run with its timeout/abort). The loop now delegates and reads the
continue/stop signal back. Behaviour-preserving — proven by the engine parity golden-master
that drives the real `_streamLoop`, plus the client tool/HITL suites (869 tests, 27/27 e2e).
