---
'@aparte/core': minor
---

Register what compacts the context with `aparteGlobalConfig.setCompactor(compactor | null)`, and read it back with `getCompactor()`. The separator's Retry and the gauge's Compact now use it. Nothing for you to change.

What is new, all additive:

- `AparteCompactor`, `AparteCompactorRequest`, `AparteCompactorOutcome` and `AparteCompactorReason` (types). A compactor has `compact(request)` (never rejects: the outcome says `ok`), `settled(targetId?)`, and optionally `beforeSend(request)` and `preview(request)`. A request names the chat by its element (`target`) and, when it has one, its `targetId`, because a chat inside a shadow root is not found by id; `force`, `exclude` and `reason` (`manual`, `retry`, `overflow`, `auto`) say how it is asked.
- A chat reads the compactor of its own config first (`resolveConfig(chat).getCompactor()`), then the global one. `setCompactor` notifies like every other registration, so a mounted gauge hears that Compact now became possible.
- The separator's **Retry** asks the compactor when one is registered, with `force: true` and `reason: 'retry'`, so it runs even when automatic compaction has stopped after failures. With none registered it dispatches `aparte-compact` as before.

Why. Core cannot import the compaction plugin, and an event answers nothing: the caller needs to know the summary is written before it goes on, and a button needs to know it is still working. `@aparte/plugin-compaction` registers itself here when it is set up; core never compacts on its own.
