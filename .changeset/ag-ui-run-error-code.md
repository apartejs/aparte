---
'@aparte/runner-ag-ui': patch
---

A `RUN_ERROR` whose `code` is one of aparté's error codes (`USAGE_RATE_LIMIT`, `CONFIG_INVALID_KEY`…) now keeps that code, so the error card says its sentence; nothing to change in your code.

Every `RUN_ERROR` used to become a `PROVIDER_ERROR`, so the card read "The assistant couldn't answer. Try again in a moment." whatever the agent said. An agent that finds a reason mid-run (a tool hitting a rate limit) has already answered 200, so no HTTP status can carry it: the code is the only place left. aparté's own agent wire already read a `run-error` line's code this way; the AG-UI runner now does the same. Any other code, or none, is still a provider error, the agent's own value kept in the error's `data`.
