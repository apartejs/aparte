---
"@aparte/core": minor
---

`<AparteUi>` now forwards the shell, transcript and turn-lifecycle events: `aparte-split-resize`, `aparte-sidebar-toggle`, `aparte-suggestion`, `aparte-scroll-rail-jump`, `aparte-context-threshold`, `aparte-message-start`, `aparte-message-done`, `aparte-message-error`, `aparte-message-aborted` and `aparte-tool-approval-request`.

`APARTE_DEFAULT_UI_EVENTS` is what all four wrappers listen for when you pass no `events` of your own, so a name missing from it is an event a wrapper consumer cannot hear at all. It carried 25 of the 35 core dispatches on an element. Five of the missing ten were the entire up-stack surface of this release; the other five were excluded on a stated reason — "they go out through `window.dispatchEvent`" — that the code contradicts: `dispatchLifecycleEvent` sends them on the host element, bubbling and composed, and the composer's `window` broadcast is a second path rather than the only one.

`aparte-abort`, `aparte-compact` and `aparte-config-change` stay out, and now for a reason that is true of them: `window` is the only place they go.

The list is checked against core's dispatch sites by `pnpm check:event-map`, so "verified against core" is a check rather than a claim — it had been a claim twice, and been wrong twice.
