---
"@aparte/core": patch
"@aparte/engine": patch
"@aparte/provider-openai-compat": patch
---

Robustness fixes surfaced by the code audit:

- **core `AparteConfig`** — `_notify` isolates each subscriber in try/catch (one throwing
  listener no longer aborts the loop and starves the others); `setLocale`/`extendLocale`/
  `setAvatarProvider` now notify subscribers like every other live setter, so a runtime
  locale/avatar swap propagates to already-mounted components; `refreshProviderModels` is
  typed `Promise<AparteAIModel[]>` instead of `Promise<any[]>`.
- **engine** — a tool handler is no longer invoked when the run's `AbortSignal` was already
  aborted before the call (a past `abort` event never re-fires on the fresh listener).
- **provider-openai-compat** — malformed tool-call arguments JSON at
  `finish_reason: 'tool_calls'` and unparseable SSE data lines now log a breadcrumb instead
  of being dropped silently.
